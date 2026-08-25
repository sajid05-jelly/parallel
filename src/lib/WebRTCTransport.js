import { ICE_SERVERS, NEARBY_ICE_SERVERS, WEBRTC_CHUNK_SIZE, HIGH_WATER_MARK, LOW_WATER_MARK } from '../config/constants';
import { generateEncryptionKey, encryptChunk, base64urlEncode } from './crypto';
import { createSession, updateSession, cancelSession } from './sessionManager';
import { SupabaseSignaling } from './SupabaseSignaling';
import { encodeControlMessage, encodeBinaryChunk, decodeMessage, MESSAGE_TYPES } from './ChunkProtocol';

export class WebRTCTransport {
  constructor(options = {}) {
    const { onProgress, onStatusChange, onError, onComplete, mode = 'anywhere' } = options;
    this.onProgress = onProgress || (() => {});
    this.onStatusChange = onStatusChange || (() => {});
    this.onError = onError || (() => {});
    this.onComplete = onComplete || (() => {});
    this.mode = mode; // 'nearby' or 'anywhere'

    this.files = [];
    this.sessionId = null;
    this.token = null;
    this.encryptionKey = null;
    this.keyString = null;
    this.status = 'IDLE';

    this.peerConnection = null;
    this.dataChannel = null;
    this.signaling = null;

    this.isTransferAccepted = false;
    this.isTransferCancelled = false;
    this.isCompleted = false;
    this._manifestSent = false;

    // Negotiated chunk size — determined once DataChannel is open
    this._negotiatedChunkSize = WEBRTC_CHUNK_SIZE;

    this.progress = {
      totalBytes: 0,
      sentBytes: 0,
      percentage: 0,
      currentFile: null,
      totalFiles: 0,
      filesSent: 0,
      speed: 0,
      eta: 0
    };

    this._speedHistory = [];
    this._lastUpdate = Date.now();
    this._bytesSinceLastUpdate = 0;

    // Accurate progress tracking across resume
    this._completedFilesBytes = 0;
    this._filePlaintextBytesSent = 0;

    // ICE health tracking
    this._iceHealthy = false;

    // ── Recovery Mutex ──
    // Only ONE recovery attempt can ever run at a time.
    this._reconnectInProgress = false;

    // ── Per-file ACK state ──
    // Tracks the last chunk the receiver confirmed for the CURRENT file.
    this._currentFileAck = { fileId: null, lastAckedChunk: -1, ackedBytes: 0 };
    this._lastAckTime = 0;

    // FILE_COMPLETE signal from receiver
    this._fileCompleteReceived = false;

    // Wake Lock
    this._wakeLock = null;
    this._visibilityHandler = null;

    // ICE candidate queues
    this._outgoingIceQueue = [];
    this._iceCandidateQueue = [];

    // Single-flight ICE restart tracking
    this._answerReceived = false;
  }

  setFiles(fileList) {
    this.files = Array.from(fileList).map(file => {
      return {
        raw: file,
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
      };
    });

    this.progress.totalFiles = this.files.length;
    this.progress.totalBytes = this.files.reduce((sum, f) => sum + f.size, 0);
  }

  _updateStatus(newStatus) {
    console.log(`[WebRTCTransport] Status: ${this.status} -> ${newStatus}`);
    this.status = newStatus;
    this.onStatusChange(newStatus);
  }

  // ═══════════════════════════════════════════════════════════
  //  PORTAL CREATION & SIGNALING
  // ═══════════════════════════════════════════════════════════

  async createPortal() {
    if (this.files.length === 0) throw new Error('No files selected');

    this._updateStatus('CREATING');

    // 1. Generate client-side encryption key
    const { key, keyString } = await generateEncryptionKey();
    this.encryptionKey = key;
    this.keyString = keyString;

    // 2. Create session record in Supabase
    const { session, token, error } = await createSession({
      totalFiles: this.progress.totalFiles,
      totalBytes: this.progress.totalBytes,
      oneReceiverMode: true
    });

    if (error || !session) throw error || new Error('Failed to create session record');

    this.sessionId = session.id;
    this.token = token;

    // 3. Initialize Supabase Realtime Signaling
    this.signaling = new SupabaseSignaling(this.sessionId, 'sender');
    this._iceCandidateQueue = [];

    await this.signaling.subscribe({
      onAnswer: async (answerSdp) => {
        console.log('[WebRTCTransport] Received Answer SDP from receiver');
        console.log(`\n[ICE_RECOVERY]\nANSWER_RECEIVED\n`);
        if (this.peerConnection) {
          try {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answerSdp));
            this._answerReceived = true;
            console.log(`\n[ICE_RECOVERY]\nREMOTE_DESCRIPTION_SET\n`);
            console.log('[WebRTCTransport] Remote description (answer) set successfully');
            if (this.status === 'WAITING' || this.status === 'CREATING') {
              this._updateStatus('NEGOTIATING');
            }

            // Process queued ICE candidates
            const retryQueue = [...this._iceCandidateQueue];
            this._iceCandidateQueue = [];
            for (const cand of retryQueue) {
              try {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(cand));
                console.log(`\n[ICE_RECOVERY]\nCANDIDATE_ADDED\n`);
              } catch (e) {
                console.warn('[WebRTCTransport] Still failed to add queued ICE candidate:', e.message);
                this._iceCandidateQueue.push(cand);
              }
            }
          } catch (e) {
            console.error('[WebRTCTransport] Error setting remote description from answer:', e);
          }
        }
      },
      onIceCandidate: async (candidate) => {
        console.log('[WebRTCTransport] Received ICE candidate from receiver');
        if (this.peerConnection && candidate) {
          try {
            if (this.peerConnection.remoteDescription) {
              await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
              console.log(`\n[ICE_RECOVERY]\nCANDIDATE_ADDED\n`);
            } else {
              this._iceCandidateQueue.push(candidate);
              console.log(`\n[ICE_RECOVERY]\nCANDIDATE_QUEUED\ncandidate=${candidate.candidate}\n`);
            }
          } catch (e) {
            console.error('[WebRTCTransport] Error adding ICE candidate:', e);
          }
        }
      },
      onReceiverClaimed: async () => {
        console.log(`\n[PORTAL JOIN REQUEST]
  portalId: ${this.token}
  alreadyConnected: ${this.peerConnection?.connectionState === 'connected'}
  connectionState: ${this.peerConnection?.connectionState || 'none'}
  transferState: ${this.status}\n`);

        if (this.status === 'TRANSFERRING' || this.status === 'CONNECTED') {
          console.warn('[WebRTCTransport] ACTIVE_CONNECTION_EXISTS. Ignoring duplicate join request.');
          await this.signaling.sendSignal('ALREADY_CONNECTED', { message: 'Another device is already receiving.' });
          return;
        }

        if (this.status === 'COMPLETED') {
          console.warn('[WebRTCTransport] Transfer already completed. Cannot rejoin.');
          await this.signaling.sendSignal('ALREADY_CONNECTED', { message: 'Transfer already completed.' });
          return;
        }

        console.log('[WebRTCTransport] Receiver claimed portal. Re-broadcasting WebRTC Offer.');
        this._updateStatus('NEGOTIATING');
        if (this.peerConnection && this.peerConnection.localDescription) {
          await this.signaling.sendSignal('OFFER', this.peerConnection.localDescription);
        }
      },
      onCancel: () => {
        console.log(`\n[PEER CLOSE]
  reason: receiver cancelled
  portalId: ${this.token}
  transferState: ${this.status}\n`);
        this.cancelPortal();
      }
    });

    // 4. Initialize PeerConnection & DataChannel
    this._setupPeerConnection();

    // 5. Create WebRTC Offer
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    // 6. Broadcast Offer SDP via Signaling
    await this.signaling.sendSignal('OFFER', offer);

    this._updateStatus('WAITING');

    // Connection timeout — only fire if we never reached a data-flowing state
    this._connectionTimeout = setTimeout(() => {
      if (this.status === 'CREATING' || this.status === 'IDLE') {
        console.warn('[WebRTCTransport] Connection timed out — status:', this.status);
        this.onError(new Error('Could not connect. Check your network and try again.'));
        this._updateStatus('FAILED');
      }
    }, 60000);

    const origin = window.location.origin;
    const url = `${origin}/receive/${this.token}#key=${this.keyString}`;
    const expiresAt = new Date(Date.now() + 120 * 1000).toISOString();

    return { token: this.token, keyString: this.keyString, sessionId: this.sessionId, url, expiresAt };
  }

  // ═══════════════════════════════════════════════════════════
  //  PEER CONNECTION SETUP
  // ═══════════════════════════════════════════════════════════

  _setupPeerConnection() {
    const selectedServers = this.mode === 'nearby' ? NEARBY_ICE_SERVERS : ICE_SERVERS;
    console.log(`[WebRTCTransport] Initializing RTCPeerConnection for mode [${this.mode}]`);
    this.peerConnection = new RTCPeerConnection({ iceServers: selectedServers });

    this._outgoingIceQueue = [];

    // Handle ICE Candidates
    this.peerConnection.onicecandidate = async (event) => {
      if (event.candidate && this.signaling) {
        console.log('[WebRTCTransport] Generating ICE candidate...');
        this._outgoingIceQueue.push(event.candidate);
        this._flushOutgoingIceQueue();
      }
    };

    // ── SIMPLIFIED CONNECTION STATE HANDLER ──
    // All recovery goes through the single _attemptRecovery() mutex.
    this.peerConnection.onconnectionstatechange = async () => {
      const state = this.peerConnection?.connectionState;
      const iceState = this.peerConnection?.iceConnectionState;
      console.log(`[WebRTCTransport] PeerConnection state: ${state}, ICE: ${iceState}, DC: ${this.dataChannel?.readyState}`);

      if (state === 'connected') {
        this._iceHealthy = true;
        if (this._connectionTimeout) clearTimeout(this._connectionTimeout);

        // Strict LAN Validation for Nearby Mode
        if (this.mode === 'nearby') {
          let isDirectLocal = false;
          try {
            const stats = await this.peerConnection.getStats();
            let activePairFound = false;
            stats.forEach((report) => {
              if (report.type === 'candidate-pair' && (report.state === 'succeeded' || report.nominated)) {
                activePairFound = true;
                const localCand = stats.get(report.localCandidateId);
                const remoteCand = stats.get(report.remoteCandidateId);
                console.log('[WebRTCTransport] Active candidate pair:', localCand?.candidateType, '<->', remoteCand?.candidateType);

                if (localCand?.candidateType === 'relay' || remoteCand?.candidateType === 'relay') {
                  isDirectLocal = false;
                } else if (localCand?.candidateType === 'host' && remoteCand?.candidateType === 'host') {
                  isDirectLocal = true;
                } else if (localCand?.candidateType === 'host' || remoteCand?.candidateType === 'host' || localCand?.candidateType === 'srflx') {
                  isDirectLocal = true;
                }
              }
            });
            if (!activePairFound) isDirectLocal = true;
          } catch (e) {
            console.warn('[WebRTCTransport] Stats error:', e);
            isDirectLocal = true;
          }

          if (!isDirectLocal) {
            console.error('[WebRTCTransport] Nearby mode rejected: active candidate pair uses TURN/relay!');
            this.onError(new Error('Nearby Transfer requires both devices to be connected to the same Wi-Fi.'));
            this._updateStatus('FAILED');
            return;
          }
        }

        if (this.status === 'RECOVERING') {
          // Bug fix: Only transition to TRANSFERRING when DataChannel is ALSO open.
          // If DC is not open yet, the DC onopen handler will handle the transition.
          if (this.dataChannel?.readyState === 'open') {
            this._updateStatus('TRANSFERRING');
          } else {
            console.log('[WebRTCTransport] PC connected during recovery but DC not open yet — waiting for DC onopen');
          }
        } else if (this.status !== 'TRANSFERRING' && this.status !== 'COMPLETED') {
          this._updateStatus('CONNECTED');
        }

      } else if (state === 'disconnected') {
        this._iceHealthy = false;
        this._logDiagnostics('ICE_DISCONNECTED');
        if (this.status === 'TRANSFERRING' || this.status === 'CONNECTED') {
          this._updateStatus('RECOVERING');
        }
        // Single recovery entry point
        this._attemptRecovery();

      } else if (state === 'failed') {
        this._iceHealthy = false;
        this._logDiagnostics('ICE_FAILED');
        if (this.isTransferCancelled || this.isCompleted) return;
        if (this.status === 'TRANSFERRING' || this.status === 'CONNECTED') {
          this._updateStatus('RECOVERING');
        }
        // Single recovery entry point
        this._attemptRecovery();
      }
    };

    this._setupDataChannel();
  }

  // ═══════════════════════════════════════════════════════════
  //  DATA CHANNEL SETUP
  // ═══════════════════════════════════════════════════════════

  _setupDataChannel() {
    if (this.dataChannel) {
      try { this.dataChannel.close(); } catch(e) {}
    }
    this.dataChannel = this.peerConnection.createDataChannel('parallel-transfer', {
      ordered: true
    });
    this.dataChannel.binaryType = 'arraybuffer';

    this.dataChannel.onopen = () => {
      console.log('[WebRTCTransport] DataChannel opened');
      this._iceHealthy = true;
      this._negotiatedChunkSize = 65536;

      this.files = this.files.map(f => ({
        ...f,
        totalChunks: Math.ceil(f.size / this._negotiatedChunkSize)
      }));

      if (this.status === 'RECOVERING') {
        // Recovery succeeded — send loop is paused and will auto-resume
        // because _waitForChannelReady() polls for DC open + iceHealthy
        this._updateStatus('TRANSFERRING');
      } else if (!this._manifestSent) {
        // First connection — send manifest
        this._updateStatus('CONNECTED');
        this._sendManifest();
        this._manifestSent = true;
      }

      this._startHeartbeat();
    };

    this.dataChannel.onmessage = (event) => {
      this._handleDataChannelMessage(event.data);
    };

    this.dataChannel.onerror = (err) => {
      console.error('[WebRTCTransport] DataChannel error:', err);
    };

    this.dataChannel.onclose = () => {
      console.log('[WebRTCTransport] DataChannel closed. isCompleted:', this.isCompleted, 'status:', this.status);
      this._stopHeartbeat();
      if (this.isTransferCancelled) return;
      if (!this.isCompleted && (this.status === 'TRANSFERRING' || this.status === 'CONNECTED')) {
        this._iceHealthy = false;
        this._updateStatus('RECOVERING');
        this._attemptRecovery();
      }
    };
  }

  // ═══════════════════════════════════════════════════════════
  //  ICE CANDIDATE QUEUE (for offline signaling)
  // ═══════════════════════════════════════════════════════════

  async _flushOutgoingIceQueue() {
    if (!this.signaling || this._outgoingIceQueue.length === 0) return;
    
    const remainingQueue = [];
    for (const candidate of this._outgoingIceQueue) {
      try {
        await this.signaling.sendSignal('ICE_CANDIDATE', candidate);
        console.log('[WebRTCTransport] Successfully sent queued ICE candidate');
      } catch (err) {
        console.warn('[WebRTCTransport] Failed to send ICE candidate (will retry):', err.message);
        remainingQueue.push(candidate);
      }
    }
    this._outgoingIceQueue = remainingQueue;
    
    if (this._outgoingIceQueue.length > 0) {
      if (this._iceQueueTimeout) clearTimeout(this._iceQueueTimeout);
      this._iceQueueTimeout = setTimeout(() => this._flushOutgoingIceQueue(), 1000);
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  SINGLE RECOVERY PATH (MUTEX-PROTECTED, 3-PHASE)
  //
  //  Phase 1: If PC is connected but DC dead → recreate DC only
  //  Phase 2: Wait 3s for natural ICE self-healing
  //  Phase 3: Single-flight ICE restart (one offer at a time)
  //
  //  NEVER creates a DataChannel while PC is disconnected/failed.
  //  DataChannel is ONLY recreated after PC is connected.
  // ═══════════════════════════════════════════════════════════

  async _attemptRecovery() {
    // ── Mutex: Only ONE recovery can run at a time ──
    if (this._reconnectInProgress) {
      console.log('[RECOVERY] Already in progress — skipping duplicate call');
      return;
    }
    if (this.isTransferCancelled || this.isCompleted || this.status === 'COMPLETED' || this.status === 'FAILED') {
      return;
    }

    this._reconnectInProgress = true;
    this._logDiagnostics('RECOVERY_START');

    console.log(`\n[ICE_RECOVERY]
START
connectionState=${this.peerConnection?.connectionState}
iceConnectionState=${this.peerConnection?.iceConnectionState}
signalingState=${this.peerConnection?.signalingState}\n`);

    try {
      // ── Phase 1: PC connected but DC dead → just recreate DC ──
      if (this.peerConnection?.connectionState === 'connected' && 
          ['connected', 'completed'].includes(this.peerConnection?.iceConnectionState)) {
        if (!this.dataChannel || this.dataChannel.readyState === 'closed' || this.dataChannel.readyState === 'closing') {
          console.log('[RECOVERY] Phase 1: PC connected but DataChannel dead — recreating DC');
          this._setupDataChannel();
          for (let i = 0; i < 25; i++) { // Wait up to 5s
            if (this._isConnectionHealthy()) {
              console.log('[RECOVERY] Phase 1 success: DataChannel reopened');
              this._iceHealthy = true;
              if (this.status === 'RECOVERING') this._updateStatus('TRANSFERRING');
              return;
            }
            await new Promise(r => setTimeout(r, 200));
          }
        }
        // DC might still be open — check
        if (this._isConnectionHealthy()) {
          console.log('[RECOVERY] Phase 1: connection is already healthy');
          this._iceHealthy = true;
          if (this.status === 'RECOVERING') this._updateStatus('TRANSFERRING');
          return;
        }
      }

      // ── Phase 2: Wait 3s for natural ICE recovery ──
      // ICE 'disconnected' often self-heals without any intervention
      console.log('[RECOVERY] Phase 2: Waiting 3s for natural ICE recovery...');
      for (let i = 0; i < 15; i++) {
        if (this.isTransferCancelled || this.status === 'FAILED') return;
        if (this._isConnectionHealthy()) {
          console.log('[RECOVERY] Phase 2 success: natural ICE recovery');
          this._iceHealthy = true;
          if (this.status === 'RECOVERING') this._updateStatus('TRANSFERRING');
          return;
        }
        await new Promise(r => setTimeout(r, 200));
      }

      // ── Phase 3: Controlled ICE restart (single-flight, max 5 attempts) ──
      const MAX_ATTEMPTS = 5;
      let delay = 2000;

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (this.isTransferCancelled || this.isCompleted || this.status === 'FAILED') break;

        console.log(`[RECOVERY] Phase 3: ICE restart attempt ${attempt + 1}/${MAX_ATTEMPTS}`);
        this._logDiagnostics(`ICE_RESTART_ATTEMPT_${attempt + 1}`);

        // Check signaling health before attempting
        if (this.signaling?.isConnected === false) {
          console.warn('[RECOVERY] Signaling disconnected — waiting 5s for reconnect...');
          await new Promise(r => setTimeout(r, 5000));
          if (this.signaling?.isConnected === false) {
            console.error('[RECOVERY] Signaling still disconnected — skipping attempt');
            continue;
          }
        }

        try {
          if (!this.peerConnection || this.peerConnection.signalingState === 'closed') {
            console.error('[RECOVERY] PeerConnection is closed — cannot restart ICE');
            break;
          }

          // ── Single-flight: ONE offer, then wait for answer + connection ──
          this._answerReceived = false;
          
          console.log(`\n[ICE_RECOVERY]
CREATED_OFFER
sdpType=offer
iceRestart=true\n`);
          const offer = await this.peerConnection.createOffer({ iceRestart: true });
          
          await this.peerConnection.setLocalDescription(offer);
          console.log(`\n[ICE_RECOVERY]\nLOCAL_DESCRIPTION_SET\n`);
          
          await this.signaling.sendSignal('OFFER', offer);
          console.log(`\n[ICE_RECOVERY]\nOFFER_SENT\n`);

          // Wait up to 15s for connection recovery
          const deadline = Date.now() + 15000;
          console.log(`\n[ICE_RECOVERY]\nWAITING_FOR_CONNECTED\n`);
          
          while (Date.now() < deadline) {
            if (this.isTransferCancelled || this.status === 'FAILED') break;

            // Full health check
            if (this._isConnectionHealthy()) {
              console.log(`\n[ICE_RECOVERY]
CONNECTED
connectionState=${this.peerConnection?.connectionState}
iceConnectionState=${this.peerConnection?.iceConnectionState}
dataChannel=${this.dataChannel?.readyState}\n`);
              this._iceHealthy = true;
              if (this.status === 'RECOVERING') this._updateStatus('TRANSFERRING');
              return;
            }

            // PC reconnected but DC is dead → recreate DC now (safe because PC is connected)
            if (this.peerConnection?.connectionState === 'connected' &&
                ['connected', 'completed'].includes(this.peerConnection?.iceConnectionState) &&
                (!this.dataChannel || this.dataChannel.readyState === 'closed' || this.dataChannel.readyState === 'closing')) {
              console.log('[RECOVERY] PC reconnected — recreating DataChannel');
              this._setupDataChannel();
              // Wait up to 3s for DC to open
              for (let j = 0; j < 15; j++) {
                if (this._isConnectionHealthy()) {
                  console.log(`\n[ICE_RECOVERY]
CONNECTED
connectionState=${this.peerConnection?.connectionState}
iceConnectionState=${this.peerConnection?.iceConnectionState}
dataChannel=${this.dataChannel?.readyState}\n`);
                  this._iceHealthy = true;
                  if (this.status === 'RECOVERING') this._updateStatus('TRANSFERRING');
                  return;
                }
                await new Promise(r => setTimeout(r, 200));
              }
            }

            await new Promise(r => setTimeout(r, 500));
          }

        } catch (e) {
          console.warn(`[RECOVERY] Attempt ${attempt + 1} error:`, e.message);
          this._logDiagnostics(`ICE_RESTART_ERROR_${attempt + 1}`);
        }

        // Backoff before next attempt
        if (attempt < MAX_ATTEMPTS - 1) {
          console.log(`[RECOVERY] Waiting ${Math.round(delay)}ms before next attempt...`);
          await new Promise(r => setTimeout(r, delay));
          delay = Math.min(delay * 1.5, 10000);
        }
      }

      // ── All attempts exhausted ──
      if (!this.isCompleted && !this.isTransferCancelled && this.status !== 'FAILED') {
        // Final check
        if (this._isConnectionHealthy()) {
          console.log(`\n[ICE_RECOVERY]
CONNECTED
connectionState=${this.peerConnection?.connectionState}
iceConnectionState=${this.peerConnection?.iceConnectionState}
dataChannel=${this.dataChannel?.readyState}\n`);
          this._iceHealthy = true;
          if (this.status === 'RECOVERING') this._updateStatus('TRANSFERRING');
          return;
        }

        console.log(`\n[ICE_RECOVERY]
FAILED
connectionState=${this.peerConnection?.connectionState}
iceConnectionState=${this.peerConnection?.iceConnectionState}
signalingState=${this.peerConnection?.signalingState}\n`);

        this._logDiagnostics('RECOVERY_FAILED');
        console.error('[RECOVERY] All recovery attempts exhausted.');
        if (this.mode === 'nearby') {
          this.onError(new Error('Nearby Transfer: connection lost. Ensure both devices are on the same Wi-Fi.'));
        } else {
          this.onError(new Error('Connection lost. Recovery failed after multiple attempts. Try again.'));
        }
        this._updateStatus('FAILED');
      }

    } finally {
      this._reconnectInProgress = false;
    }
  }

  /**
   * Returns true when BOTH PeerConnection is connected AND DataChannel is open.
   */
  _isConnectionHealthy() {
    return this.peerConnection?.connectionState === 'connected' &&
           ['connected', 'completed'].includes(this.peerConnection?.iceConnectionState) &&
           this.dataChannel?.readyState === 'open';
  }

  /**
   * Comprehensive diagnostic logging for every state transition.
   */
  _logDiagnostics(context) {
    const diag = {
      context,
      timestamp: new Date().toISOString(),
      role: 'sender',
      connectionState: this.peerConnection?.connectionState || 'none',
      iceConnectionState: this.peerConnection?.iceConnectionState || 'none',
      iceGatheringState: this.peerConnection?.iceGatheringState || 'none',
      signalingState: this.peerConnection?.signalingState || 'none',
      dataChannelState: this.dataChannel?.readyState || 'none',
      currentFile: this.progress.currentFile?.name || 'none',
      sentBytes: this.progress.sentBytes,
      totalBytes: this.progress.totalBytes,
      bufferedAmount: this.dataChannel?.bufferedAmount || 0,
      lastAckChunk: this._currentFileAck?.lastAckedChunk ?? -1,
      lastAckTime: this._lastAckTime ? new Date(this._lastAckTime).toISOString() : 'never',
      iceHealthy: this._iceHealthy,
      reconnectInProgress: this._reconnectInProgress,
      signalingConnected: this.signaling?.isConnected ?? 'unknown',
      status: this.status
    };
    console.log('[TRANSFER_DEBUG]', JSON.stringify(diag, null, 2));
  }

  /**
   * Wait for DataChannel to be open AND ICE to be healthy.
   * The send loop calls this to pause/resume automatically.
   */
  async _waitForChannelReady(timeoutMs = 90000) {
    if (this.dataChannel?.readyState === 'open' && this._iceHealthy) return;

    console.log('[TRANSFER] Waiting for channel recovery...');
    const start = Date.now();

    while (true) {
      if (this.isTransferCancelled || this.status === 'FAILED' || this.status === 'CANCELLED') {
        throw new Error('Transfer cancelled or failed during recovery wait');
      }
      if (this.dataChannel?.readyState === 'open' && this._iceHealthy) {
        console.log(`[TRANSFER] Channel ready after ${Date.now() - start}ms`);
        return;
      }

      // During RECOVERING, extend the timeout — recovery is actively happening
      if (this.status === 'RECOVERING') {
        // Don't timeout while recovery is actively running
        await new Promise(r => setTimeout(r, 300));
        continue;
      }

      if (Date.now() - start > timeoutMs) {
        throw new Error('Connection recovery timed out');
      }
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  HEARTBEAT
  // ═══════════════════════════════════════════════════════════

  _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatInterval = setInterval(() => {
      if (this.dataChannel?.readyState === 'open') {
        try {
          this.dataChannel.send(encodeControlMessage(MESSAGE_TYPES.PING));
        } catch(e) {}
      }
    }, 5000);
  }

  _stopHeartbeat() {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  TRANSFER WATCHDOG
  //  Monitors actual ACK progress. If no ACKs arrive for 30s
  //  AND DataChannel is dead, triggers recovery.
  //  Does NOT trigger on speed=0 alone (backpressure is normal).
  // ═══════════════════════════════════════════════════════════

  _startWatchdog() {
    this._stopWatchdog();
    this._watchdogInterval = setInterval(() => {
      if (this.status !== 'TRANSFERRING' && this.status !== 'RECOVERING') return;
      if (this.isCompleted || this.isTransferCancelled) {
        this._stopWatchdog();
        return;
      }

      const timeSinceLastAck = Date.now() - this._lastAckTime;

      // If we haven't received any ACK in 30 seconds and the DataChannel is dead
      if (timeSinceLastAck > 30000 && this.dataChannel?.readyState !== 'open') {
        console.warn(`[WATCHDOG] No ACK for ${Math.round(timeSinceLastAck/1000)}s and DataChannel is ${this.dataChannel?.readyState}. Triggering recovery.`);
        if (this.status !== 'RECOVERING') {
          this._iceHealthy = false;
          this._updateStatus('RECOVERING');
        }
        this._attemptRecovery();
      }
    }, 10000);
  }

  _stopWatchdog() {
    if (this._watchdogInterval) {
      clearInterval(this._watchdogInterval);
      this._watchdogInterval = null;
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  MANIFEST
  // ═══════════════════════════════════════════════════════════

  _sendManifest() {
    const manifest = {
      transferId: this.sessionId,
      totalFiles: this.progress.totalFiles,
      totalBytes: this.progress.totalBytes,
      files: this.files.map(f => ({
        id: f.id,
        name: f.name,
        size: f.size,
        type: f.type,
        totalChunks: f.totalChunks
      }))
    };

    console.log('[WebRTCTransport] Sending manifest:', JSON.stringify(manifest.files.map(f => ({ name: f.name, size: f.size, totalChunks: f.totalChunks }))));
    this.dataChannel.send(encodeControlMessage(MESSAGE_TYPES.MANIFEST, manifest));
  }

  // ═══════════════════════════════════════════════════════════
  //  INCOMING MESSAGE HANDLER
  // ═══════════════════════════════════════════════════════════

  _handleDataChannelMessage(data) {
    const msg = decodeMessage(data);
    if (!msg.isControl) return;

    if (msg.type === MESSAGE_TYPES.TRANSFER_ACCEPTED) {
      // Guard: only start file stream once
      if (!this.isTransferAccepted) {
        console.log('[WebRTCTransport] Receiver accepted transfer. Starting chunk stream...');
        this.isTransferAccepted = true;
        this._updateStatus('TRANSFERRING');
        this._acquireWakeLock();
        this._startWatchdog();
        this._startFileStream();
      }

    } else if (msg.type === MESSAGE_TYPES.TRANSFER_COMPLETE_ACK) {
      console.log('[WebRTCTransport] TRANSFER_COMPLETE_ACK received. Transfer confirmed complete.');
      this.isCompleted = true;
      if (this._connectionTimeout) clearTimeout(this._connectionTimeout);
      this._stopWatchdog();
      this._releaseWakeLock();
      this._updateStatus('COMPLETED');
      updateSession(this.sessionId, { status: 'COMPLETED' }).catch(e =>
        console.warn('[WebRTCTransport] Session update to COMPLETED failed (non-critical):', e)
      );
      this.onComplete({ token: this.token, keyString: this.keyString, sessionId: this.sessionId });

    } else if (msg.type === MESSAGE_TYPES.CANCEL) {
      if (!this.isCompleted && this.status !== 'COMPLETED') {
        console.log('[WebRTCTransport] Receiver requested transfer cancellation');
        this.cancelPortal();
      }

    } else if (msg.type === MESSAGE_TYPES.PING) {
      if (this.dataChannel?.readyState === 'open') {
        this.dataChannel.send(encodeControlMessage(MESSAGE_TYPES.PONG));
      }

    } else if (msg.type === MESSAGE_TYPES.PONG) {
      this._lastPong = Date.now();

    } else if (msg.type === MESSAGE_TYPES.ACK) {
      // ── Per-file ACK handling ──
      // Only update if ACK belongs to the current file
      const ackFileId = msg.payload?.fileId;
      const ackChunkIndex = msg.payload?.chunkIndex || 0;
      const ackReceivedBytes = msg.payload?.receivedBytes || 0;

      if (ackFileId && ackFileId === this._currentFileAck.fileId) {
        this._currentFileAck.lastAckedChunk = Math.max(this._currentFileAck.lastAckedChunk, ackChunkIndex);
        this._currentFileAck.ackedBytes = Math.max(this._currentFileAck.ackedBytes, ackReceivedBytes);
      }
      this._lastAckTime = Date.now();

    } else if (msg.type === MESSAGE_TYPES.FILE_COMPLETE) {
      console.log('[WebRTCTransport] FILE_COMPLETE received');
      this._fileCompleteReceived = true;
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  FILE STREAM — RESILIENT OUTER LOOP
  //  This function NEVER exits due to a temporary disconnect.
  //  The inner _sendFileInChunks() pauses and auto-resumes.
  // ═══════════════════════════════════════════════════════════

  async _startFileStream() {
    try {
      this._lastUpdate = Date.now();
      this._bytesSinceLastUpdate = 0;
      this._completedFilesBytes = 0;

      for (let i = 0; i < this.files.length; i++) {
        if (this.isTransferCancelled || this.status === 'FAILED') break;

        const fileInfo = this.files[i];
        this.progress.currentFile = fileInfo;

        // Reset per-file ACK state
        this._currentFileAck = { fileId: fileInfo.id, lastAckedChunk: -1, ackedBytes: 0 };
        this._filePlaintextBytesSent = 0;
        this._fileCompleteReceived = false;

        console.log(`[TRANSFER] Starting file ${i + 1}/${this.files.length}: ${fileInfo.name} (${fileInfo.size} bytes, ${fileInfo.totalChunks} chunks)`);

        // Ensure channel is ready before sending FILE_START
        await this._waitForChannelReady();
        this.dataChannel.send(encodeControlMessage(MESSAGE_TYPES.FILE_START, { fileId: fileInfo.id }));

        // Send all chunks — loop pauses and resumes automatically on disconnect
        await this._sendFileInChunks(fileInfo);

        // Ensure channel is ready before sending FILE_END
        await this._waitForChannelReady();
        this.dataChannel.send(encodeControlMessage(MESSAGE_TYPES.FILE_END, { fileId: fileInfo.id }));

        // Wait for receiver to verify and confirm file assembly
        await this._waitForFileComplete(fileInfo.id);

        this._completedFilesBytes += fileInfo.size;
        this.progress.filesSent++;
        console.log(`[TRANSFER] File ${i + 1} complete: ${fileInfo.name}`);
      }

      if (!this.isTransferCancelled && this.status !== 'FAILED') {
        // Final buffer drain
        await this._flushBuffer();

        // Send TRANSFER_COMPLETE (retried if needed)
        await this._waitForChannelReady();
        console.log('[TRANSFER] All files sent and verified. Sending TRANSFER_COMPLETE...');
        this.dataChannel.send(encodeControlMessage(MESSAGE_TYPES.TRANSFER_COMPLETE));
        // Completion is handled by TRANSFER_COMPLETE_ACK in _handleDataChannelMessage
      }

    } catch (err) {
      console.error('[WebRTCTransport] File stream error:', err.message);
      if (!this.isCompleted && !this.isTransferCancelled) {
        this.onError(new Error(`File transfer failed: ${err.message}`));
        this._updateStatus('FAILED');
        this._stopWatchdog();
        this._releaseWakeLock();
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  CHUNK SENDER — PAUSE/RESUME ON DISCONNECT
  //  Uses a while loop so the chunk index can be reset to
  //  the last ACK'd position after a recovery.
  // ═══════════════════════════════════════════════════════════

  async _sendFileInChunks(fileInfo) {
    const file = fileInfo.raw;
    const chunkSize = this._negotiatedChunkSize;
    const totalChunks = fileInfo.totalChunks;

    const DYNAMIC_HIGH_WATER_MARK = 4 * 1024 * 1024;
    const DYNAMIC_LOW_WATER_MARK = 1024 * 1024;

    if (this.dataChannel) {
      this.dataChannel.bufferedAmountLowThreshold = DYNAMIC_LOW_WATER_MARK;
    }

    let chunkIndex = 0;

    while (chunkIndex < totalChunks) {
      if (this.isTransferCancelled || this.status === 'FAILED') {
        throw new Error('Transfer cancelled or failed');
      }

      // ── PAUSE when channel is not ready ──
      // This is the core resilience mechanism. Instead of throwing and dying,
      // the loop waits here until the channel recovers.
      if (!this._iceHealthy || !this.dataChannel || this.dataChannel.readyState !== 'open') {
        console.log(`[TRANSFER] Send paused at chunk ${chunkIndex}/${totalChunks} for ${fileInfo.name}`);

        await this._waitForChannelReady();

        // After recovery, resume from last ACK'd chunk + 1
        const resumeFrom = Math.max(0, this._currentFileAck.lastAckedChunk + 1);
        if (resumeFrom > 0 && resumeFrom !== chunkIndex) {
          console.log(`[TRANSFER] Resuming ${fileInfo.name} from chunk ${resumeFrom} (was at ${chunkIndex})`);
          chunkIndex = resumeFrom;
          // Recalculate bytes sent for this file to match ACK'd position
          this._filePlaintextBytesSent = Math.min(file.size, resumeFrom * chunkSize);
          this.progress.sentBytes = Math.max(this.progress.sentBytes || 0, this._completedFilesBytes + this._filePlaintextBytesSent);
          // Reset speed tracking
          this._lastUpdate = Date.now();
          this._bytesSinceLastUpdate = 0;
          this._speedHistory = [];
          this._lastActualSentBytes = this.progress.sentBytes;
        }

        // Re-set backpressure threshold on the (possibly new) DataChannel
        if (this.dataChannel) {
          this.dataChannel.bufferedAmountLowThreshold = DYNAMIC_LOW_WATER_MARK;
        }
        continue; // Re-check at top of loop
      }

      // ── Backpressure: wait if SCTP buffer is building up ──
      if (this.dataChannel.bufferedAmount > DYNAMIC_HIGH_WATER_MARK) {
        await this._waitForBufferDrain(DYNAMIC_LOW_WATER_MARK);
      }

      // ── Flow control: don't get too far ahead of receiver ACKs ──
      const MAX_IN_FLIGHT = 8 * 1024 * 1024;
      while ((this._filePlaintextBytesSent - this._currentFileAck.ackedBytes) > MAX_IN_FLIGHT) {
        if (this.isTransferCancelled || this.status === 'FAILED') throw new Error('Transfer cancelled');
        if (!this._iceHealthy || !this.dataChannel || this.dataChannel.readyState !== 'open') break; // Let pause check handle it
        this._updateProgressStats();
        await new Promise(r => setTimeout(r, 50));
      }

      // Re-check channel after flow control wait
      if (!this.dataChannel || this.dataChannel.readyState !== 'open') continue;

      // ── Read and encrypt chunk ──
      const start = chunkIndex * chunkSize;
      const end = Math.min(file.size, start + chunkSize);
      const chunkPlaintextSize = end - start;

      const blobSlice = file.slice(start, end);
      const rawArrayBuffer = await blobSlice.arrayBuffer();
      const encryptedChunkPayload = await encryptChunk(this.encryptionKey, rawArrayBuffer);

      const packet = encodeBinaryChunk({
        fileId: fileInfo.id,
        chunkIndex,
        totalChunks,
        payloadBuffer: encryptedChunkPayload
      });

      // ── Send with retry ──
      let sent = false;
      let sendAttempts = 0;
      while (!sent && sendAttempts < 3) {
        if (this.isTransferCancelled || this.status === 'FAILED') throw new Error('Transfer cancelled');
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') break; // Let pause check handle it
        try {
          this.dataChannel.send(packet);
          sent = true;
        } catch (e) {
          sendAttempts++;
          if (e.name === 'TypeError' || e.name === 'OperationError' || (e.message && e.message.toLowerCase().includes('buffer'))) {
            console.warn(`[TRANSFER] Send buffer error on chunk ${chunkIndex}, backing off...`);
            await new Promise(r => setTimeout(r, 100));
            if (this.dataChannel?.bufferedAmount > DYNAMIC_HIGH_WATER_MARK) {
              await this._waitForBufferDrain(DYNAMIC_LOW_WATER_MARK);
            }
          } else {
            // Channel probably closed — will be caught by pause check
            break;
          }
        }
      }

      if (!sent) {
        // Failed to send — don't advance chunkIndex, let pause check handle recovery
        continue;
      }

      this._filePlaintextBytesSent += chunkPlaintextSize;
      this.progress.sentBytes = this._completedFilesBytes + this._filePlaintextBytesSent;
      this._bytesSinceLastUpdate += chunkPlaintextSize;

      this._updateProgressStats();

      // Yield to browser event loop every 5 chunks so ICE keepalives get processed
      if (chunkIndex % 5 === 0) {
        await new Promise(r => setTimeout(r, 0));
      }

      chunkIndex++;
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  WAIT FOR FILE COMPLETE (receiver verification)
  //  Resilient to disconnects — pauses timeout during recovery.
  //  Re-sends FILE_END periodically in case it was lost.
  // ═══════════════════════════════════════════════════════════

  async _waitForFileComplete(fileId) {
    let lastFileSendEndTime = Date.now();
    const TIMEOUT = 120000; // 2 minutes total (excluding recovery time)
    let activeWaitTime = 0;

    while (true) {
      if (this.isTransferCancelled || this.status === 'FAILED') {
        throw new Error('Transfer cancelled while waiting for file verification');
      }

      if (this._fileCompleteReceived) {
        this._fileCompleteReceived = false;
        return;
      }

      // During RECOVERING, don't count toward timeout
      if (this.status === 'RECOVERING') {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      // Re-send FILE_END every 5s in case it was lost during recovery
      if (this.dataChannel?.readyState === 'open' && Date.now() - lastFileSendEndTime > 5000) {
        try {
          this.dataChannel.send(encodeControlMessage(MESSAGE_TYPES.FILE_END, { fileId }));
          lastFileSendEndTime = Date.now();
        } catch (e) { /* channel might have just closed */ }
      }

      await new Promise(r => setTimeout(r, 200));
      activeWaitTime += 200;

      if (activeWaitTime > TIMEOUT) {
        throw new Error('Timeout waiting for receiver to verify file.');
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  BUFFER MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  _flushBuffer() {
    return new Promise((resolve) => {
      if (!this.dataChannel || this.dataChannel.bufferedAmount === 0) {
        return resolve();
      }
      const check = () => {
        this._updateProgressStats();
        if (!this.dataChannel || this.dataChannel.bufferedAmount === 0 || this.isTransferCancelled) {
          resolve();
        } else {
          setTimeout(check, 20);
        }
      };
      setTimeout(check, 20);
    });
  }

  _waitForBufferDrain(lowWaterMark) {
    return new Promise((resolve) => {
      if (!this.dataChannel || this.dataChannel.bufferedAmount <= lowWaterMark) {
        return resolve();
      }

      const channel = this.dataChannel;
      channel.bufferedAmountLowThreshold = lowWaterMark;
      let done = false;

      const cleanup = () => {
        if (!done) {
          done = true;
          if (channel) {
            channel.removeEventListener('bufferedamountlow', onLow);
          }
          if (timer) clearInterval(timer);
          resolve();
        }
      };

      const onLow = () => cleanup();

      // Backup polling in case browser doesn't fire 'bufferedamountlow'
      const timer = setInterval(() => {
        this._updateProgressStats();
        if (!channel || channel.bufferedAmount <= lowWaterMark) {
          cleanup();
        }
      }, 50);

      channel.addEventListener('bufferedamountlow', onLow);
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  PROGRESS STATS
  // ═══════════════════════════════════════════════════════════

  _updateProgressStats() {
    const now = Date.now();
    const dt = (now - this._lastUpdate) / 1000;

    if (this._lastActualSentBytes === undefined) {
      this._lastActualSentBytes = 0;
    }

    if (dt >= 0.1) {
      const buffered = this.dataChannel ? this.dataChannel.bufferedAmount : 0;
      const actualSentBytes = Math.max(0, this.progress.sentBytes - buffered);

      const currentSpeed = Math.max(0, actualSentBytes - this._lastActualSentBytes) / dt;
      
      this._speedHistory.push(currentSpeed);
      if (this._speedHistory.length > 10) this._speedHistory.shift();

      const rollingSpeed = this._speedHistory.reduce((a, b) => a + b, 0) / this._speedHistory.length;
      this.progress.speed = rollingSpeed;

      const remainingBytes = this.progress.totalBytes - actualSentBytes;
      this.progress.eta = rollingSpeed > 0 ? remainingBytes / rollingSpeed : 0;
      
      this.progress.percentage = Math.min(100, Math.max(0, (actualSentBytes / this.progress.totalBytes) * 100));

      this._lastUpdate = now;
      this._lastActualSentBytes = actualSentBytes;

      this.onProgress({ ...this.progress });
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  SCREEN WAKE LOCK
  // ═══════════════════════════════════════════════════════════

  async _acquireWakeLock() {
    if (!('wakeLock' in navigator)) return;
    if (this._wakeLock) return;
    try {
      this._wakeLock = await navigator.wakeLock.request('screen');
      console.log('[WakeLock] Acquired');

      this._visibilityHandler = async () => {
        if (document.visibilityState === 'visible' && !this._wakeLock &&
            (this.status === 'TRANSFERRING' || this.status === 'RECOVERING')) {
          try {
            this._wakeLock = await navigator.wakeLock.request('screen');
            console.log('[WakeLock] Re-acquired after visibility change');
          } catch (e) {
            // Non-fatal
          }
        }
      };
      document.addEventListener('visibilitychange', this._visibilityHandler);
    } catch (e) {
      console.warn('[WakeLock] Not available:', e.message);
    }
  }

  _releaseWakeLock() {
    if (this._wakeLock) {
      this._wakeLock.release().catch(() => {});
      this._wakeLock = null;
      console.log('[WakeLock] Released');
    }
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  CANCEL / CLEANUP
  // ═══════════════════════════════════════════════════════════

  async cancelPortal() {
    console.log('[WebRTCTransport] Cancelling portal transfer session');
    this.isTransferCancelled = true;
    this._stopHeartbeat();
    this._stopWatchdog();
    this._releaseWakeLock();

    if (this._connectionTimeout) {
      clearTimeout(this._connectionTimeout);
      this._connectionTimeout = null;
    }

    if (this._iceQueueTimeout) {
      clearTimeout(this._iceQueueTimeout);
      this._iceQueueTimeout = null;
    }

    if (this.dataChannel) {
      try {
        if (this.dataChannel.readyState === 'open') {
          this.dataChannel.send(encodeControlMessage(MESSAGE_TYPES.CANCEL));
        }
        this.dataChannel.close();
      } catch (e) {
        // ignore
      }
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch (e) {
        // ignore
      }
      this.peerConnection = null;
    }

    if (this.signaling) {
      try {
        this.signaling.unsubscribe();
      } catch (e) {
        // ignore
      }
      this.signaling = null;
    }

    if (this.sessionId) {
      await cancelSession(this.sessionId).catch(e =>
        console.warn('[WebRTCTransport] Session cancel failed (non-critical):', e)
      );
    }

    if (!this.isCompleted && this.status !== 'COMPLETED') {
      this._updateStatus('CANCELLED');
    }
  }
}
