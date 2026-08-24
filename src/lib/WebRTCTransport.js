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

    // ICE health tracking — used to pause sending when connection is struggling
    this._iceHealthy = false;
    this._iceRestartAttempted = false;
  }

  setFiles(fileList) {
    this.files = Array.from(fileList).map(file => {
      return {
        raw: file,
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        // totalChunks is computed after DataChannel opens with the negotiated chunk size
        // We store a placeholder; manifest is sent after DataChannel opens
      };
    });

    this.progress.totalFiles = this.files.length;
    this.progress.totalBytes = this.files.reduce((sum, f) => sum + f.size, 0);
  }

  _updateStatus(newStatus) {
    console.log(`[WebRTCTransport] Status changed: ${this.status} -> ${newStatus}`);
    this.status = newStatus;
    this.onStatusChange(newStatus);
  }

  /**
   * Sender Portal Creation & Signaling Setup
   */
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
        if (this.peerConnection) {
          try {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answerSdp));
            this._updateStatus('NEGOTIATING');

            // Process queued ICE candidates
            while (this._iceCandidateQueue.length > 0) {
              const cand = this._iceCandidateQueue.shift();
              try {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(cand));
              } catch (e) {
                console.warn('[WebRTCTransport] Error adding queued ICE candidate:', e);
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
          if (!this.peerConnection.remoteDescription) {
            this._iceCandidateQueue.push(candidate);
          } else {
            try {
              await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
              console.warn('[WebRTCTransport] Error adding remote ICE candidate:', e);
            }
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
          console.warn('[WebRTCTransport] ACTIVE_CONNECTION_EXISTS. Ignoring duplicate join request to protect active transfer.');
          await this.signaling.sendSignal('ALREADY_CONNECTED', { message: 'Another device is already receiving.' });
          return; // Do NOT destroy existing connection. The active receiver must continue.
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
transferState: ${this.status}
pcState: ${this.peerConnection?.connectionState || 'none'}
dataChannelState: ${this.dataChannel?.readyState || 'none'}\n`);
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
      const safeStates = ['CONNECTED', 'WAITING', 'NEGOTIATING', 'TRANSFERRING', 'COMPLETED'];
      // Only fail if still in initial states with no data channel open
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

  _setupPeerConnection() {
    const selectedServers = this.mode === 'nearby' ? NEARBY_ICE_SERVERS : ICE_SERVERS;
    console.log(`[WebRTCTransport] Initializing RTCPeerConnection for mode [${this.mode}]`);
    this.peerConnection = new RTCPeerConnection({ iceServers: selectedServers });

    // Handle ICE Candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.signaling) {
        console.log('[WebRTCTransport] Sending ICE candidate to receiver');
        this.signaling.sendSignal('ICE_CANDIDATE', event.candidate);
      }
    };

    this.peerConnection.onconnectionstatechange = async () => {
      const state = this.peerConnection?.connectionState;
      const iceState = this.peerConnection?.iceConnectionState;
      console.log(`[WebRTCTransport] PeerConnection state: ${state}, ICE state: ${iceState}, dataChannel: ${this.dataChannel?.readyState}, buffered: ${this.dataChannel?.bufferedAmount}`);

      if (state === 'connected') {
        this._iceHealthy = true;
        this._iceRestartAttempted = false;
        if (this._connectionTimeout) clearTimeout(this._connectionTimeout);
        if (this._recoveryTimeout) clearTimeout(this._recoveryTimeout);

        // Strict LAN Validation for Nearby Mode: Inspect selected ACTIVE ICE Candidate Pair
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

        if (this.status === 'RECOVERING' || (this.status !== 'TRANSFERRING' && this.status !== 'COMPLETED')) {
          if (this.status === 'RECOVERING') {
            this._updateStatus('TRANSFERRING');
          } else {
            this._updateStatus('CONNECTED');
          }
        }

      } else if (state === 'disconnected') {
        this._iceHealthy = false;
        console.warn('[WebRTCTransport] PeerConnection disconnected — pausing sends, waiting for recovery...');
        if (this.status === 'TRANSFERRING') {
          this._updateStatus('RECOVERING');
        }
        
        // Attempt ICE restart to recover the connection
        if (!this._iceRestartAttempted && this.peerConnection && this.signaling && !this.isTransferCancelled) {
          this._iceRestartAttempted = true;
          this._doIceRestart();
        }

      } else if (state === 'failed') {
        this._iceHealthy = false;
        if (this._connectionTimeout) clearTimeout(this._connectionTimeout);
        if (this.isTransferCancelled) {
          console.log('[WebRTCTransport] Ignoring ICE failure because transfer was intentionally cancelled.');
          return;
        }
        
        // Attempt ICE restart if not already tried
        if (!this._iceRestartAttempted && this.peerConnection && this.signaling && !this.isCompleted) {
          this._iceRestartAttempted = true;
          this._doIceRestart();
        }

        if (!this.isCompleted && this.status !== 'COMPLETED') {
          console.error('[WebRTCTransport] PeerConnection failed. ICE state:', iceState);
          
          if (this._recoveryTimeout) clearTimeout(this._recoveryTimeout);
          this._recoveryTimeout = setTimeout(() => {
            if (this.isTransferCancelled || this.status === 'COMPLETED') return;
            if (this.peerConnection?.iceConnectionState === 'connected' || this.peerConnection?.iceConnectionState === 'completed') return;
            
            // Do not fail if data channel is still open (backpressure, not death)
            if (this.dataChannel?.readyState === 'open') {
              console.warn('[WebRTCTransport] Ignoring failed state because DataChannel is open.');
              // Reset flag so we can try ICE restart again
              this._iceRestartAttempted = false;
              return;
            }

            console.error(`[TRANSFER FATAL ERROR]
reason: connection recovery failed after grace period
dataChannelState: ${this.dataChannel?.readyState}
connectionState: ${this.peerConnection?.connectionState}
iceState: ${this.peerConnection?.iceConnectionState}
bufferedAmount: ${this.dataChannel?.bufferedAmount}
sentBytes: ${this.progress?.sentBytes}
progress: ${this.progress?.percentage}`);

            if (this.mode === 'nearby') {
              this.onError(new Error('Nearby Transfer: WebRTC connection failed. Ensure both devices are on the same Wi-Fi.'));
            } else {
              this.onError(new Error('WebRTC connection failed. This can happen on restrictive networks. Try the other transfer mode.'));
            }
            this._updateStatus('FAILED');
          }, 45000);
        }
      }
    };

    this._setupDataChannel();
  }

  _setupDataChannel() {
    if (this.dataChannel) {
      try { this.dataChannel.close(); } catch(e) {}
    }
    this.dataChannel = this.peerConnection.createDataChannel('parallel-transfer', {
      ordered: true
    });
    this.dataChannel.binaryType = 'arraybuffer';

    this.dataChannel.onopen = () => {
      console.log('[WebRTCTransport] RTCDataChannel opened successfully');
      this._iceHealthy = true;
      this._negotiatedChunkSize = 16384; 
      console.log(`[WebRTCTransport] Negotiated chunk size: ${this._negotiatedChunkSize} bytes`);

      this.files = this.files.map(f => ({
        ...f,
        totalChunks: Math.ceil(f.size / this._negotiatedChunkSize)
      }));

      // If we are recovering from a drop, just send a ping and wait to resume
      if (this.status === 'RECOVERING') {
        this._updateStatus('TRANSFERRING');
      } else {
        this._updateStatus('CONNECTED');
        this._sendManifest();
      }
      this._startHeartbeat();
    };

    this.dataChannel.onmessage = (event) => {
      this._handleDataChannelMessage(event.data);
    };

    this.dataChannel.onerror = (err) => {
      console.error('[WebRTCTransport] DataChannel error:', JSON.stringify(err), err);
    };

    this.dataChannel.onclose = () => {
      console.log('[WebRTCTransport] DataChannel closed. isCompleted:', this.isCompleted, 'status:', this.status);
      this._stopHeartbeat();
      if (this.isTransferCancelled) {
        console.log('[WebRTCTransport] Ignoring DataChannel close because transfer was cancelled.');
        return;
      }
      if (!this.isCompleted && this.status === 'TRANSFERRING') {
        console.warn('[WebRTCTransport] DataChannel closed unexpectedly! Waiting for ICE recovery...');
        this._updateStatus('RECOVERING');
      }
    };
  }

  async _doIceRestart() {
    let attempts = 0;
    while (this.status === 'RECOVERING' && attempts < 5 && !this.isTransferCancelled) {
      try {
        console.log(`[WebRTCTransport] Attempting ICE restart (attempt ${attempts + 1})...`);
        if (this.dataChannel && this.dataChannel.readyState === 'closed') {
          console.log('[WebRTCTransport] Recreating DataChannel for ICE restart...');
          this._setupDataChannel();
        }
        if (this.peerConnection.signalingState !== 'closed') {
          this.peerConnection.restartIce();
          const offer = await this.peerConnection.createOffer({ iceRestart: true });
          await this.peerConnection.setLocalDescription(offer);
          await this.signaling.sendSignal('OFFER', offer);
          console.log('[WebRTCTransport] ICE restart offer sent.');
          break; // Success
        }
      } catch (e) {
        console.warn(`[WebRTCTransport] ICE restart attempt ${attempts + 1} failed:`, e);
        attempts++;
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

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

  /**
   * Send JSON Manifest over DataChannel to receiver
   * NOTE: Called AFTER DataChannel opens so totalChunks uses the negotiated chunk size
   */
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
        totalChunks: f.totalChunks  // Uses negotiated chunk size — matches what we actually send
      }))
    };

    console.log('[WebRTCTransport] Sending manifest:', JSON.stringify(manifest.files.map(f => ({ name: f.name, size: f.size, totalChunks: f.totalChunks }))));
    this.dataChannel.send(encodeControlMessage(MESSAGE_TYPES.MANIFEST, manifest));
  }

  /**
   * Handle incoming DataChannel messages from receiver
   */
  _handleDataChannelMessage(data) {
    const msg = decodeMessage(data);
    if (!msg.isControl) return;

    if (msg.type === MESSAGE_TYPES.TRANSFER_ACCEPTED) {
      console.log('[WebRTCTransport] Receiver accepted transfer. Starting chunk stream...');
      this.isTransferAccepted = true;
      this._updateStatus('TRANSFERRING');
      this._startFileStream();
    } else if (msg.type === MESSAGE_TYPES.TRANSFER_COMPLETE_ACK) {
      // FIX: Only mark COMPLETED when receiver confirms — do not complete early
      console.log('[WebRTCTransport] Received TRANSFER_COMPLETE_ACK from receiver. Transfer confirmed complete.');
      this.isCompleted = true;
      if (this._connectionTimeout) clearTimeout(this._connectionTimeout);
      this._updateStatus('COMPLETED');
      // Update session in DB
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
      // heartbeat acknowledged
      this._lastPong = Date.now();
    } else if (msg.type === MESSAGE_TYPES.ACK) {
      this._lastAckBytes = msg.payload?.receivedBytes || 0;
      this._lastAckChunkIndex = msg.payload?.chunkIndex || 0;
      this._lastAckTime = Date.now();
    } else if (msg.type === MESSAGE_TYPES.FILE_COMPLETE) {
      if (this._fileCompleteTimeout) clearTimeout(this._fileCompleteTimeout);
      if (this._currentFileCompleteResolve) {
        this._currentFileCompleteResolve();
        this._currentFileCompleteResolve = null;
      }
    }
  }

  /**
   * Stream files sequentially over DataChannel with backpressure control
   */
  async _startFileStream() {
    try {
      this._lastUpdate = Date.now();
      this._bytesSinceLastUpdate = 0;

      for (let i = 0; i < this.files.length; i++) {
        if (this.isTransferCancelled) break;
        const fileInfo = this.files[i];
        this.progress.currentFile = fileInfo;

        console.log(`[WebRTCTransport] Starting file ${i + 1}/${this.files.length}: ${fileInfo.name} (${fileInfo.size} bytes, ${fileInfo.totalChunks} chunks)`);

        // Signal FILE_START
        this.dataChannel.send(encodeControlMessage(MESSAGE_TYPES.FILE_START, { fileId: fileInfo.id }));

        let fileFinished = false;
        let attempts = 0;
        
        while (!fileFinished && attempts < 10) {
          try {
            const startChunk = this._lastAckChunkIndex || 0;
            await this._sendFileInChunks(fileInfo, startChunk);
            fileFinished = true; // Loop completed without throwing
          } catch (e) {
            console.warn(`[WebRTCTransport] File stream interrupted: ${e.message}. Attempting to resume...`);
            attempts++;
            if (this.isTransferCancelled || this.status === 'FAILED') break;
            // Wait for ICE / DataChannel to recover before retrying
            let waitMs = 0;
            while ((!this._iceHealthy || !this.dataChannel || this.dataChannel.readyState !== 'open') && !this.isTransferCancelled && this.status !== 'FAILED') {
              await new Promise(r => setTimeout(r, 1000));
              waitMs += 1000;
              if (waitMs > 60000) {
                throw new Error('Timeout waiting for connection to recover during retry');
              }
            }
            if (this.isTransferCancelled || this.status === 'FAILED') break;

            // Recreate DataChannel if it closed
            if (this.dataChannel && this.dataChannel.readyState !== 'open') {
              console.log('[WebRTCTransport] DataChannel is not open during retry. Recreating...');
              this._setupDataChannel();
              
              // Wait for it to open
              let waitOpenMs = 0;
              while (this.dataChannel && this.dataChannel.readyState !== 'open' && !this.isTransferCancelled && this.status !== 'FAILED') {
                await new Promise(r => setTimeout(r, 500));
                waitOpenMs += 500;
                if (waitOpenMs > 30000) throw new Error('Timeout waiting for recreated DataChannel to open');
              }
            }

            console.log(`[WebRTCTransport] Connection recovered, resuming ${fileInfo.name}...`);
          }
        }
        
        if (!fileFinished) {
          throw new Error('Failed to send file completely after multiple recovery attempts');
        }

        this.dataChannel.send(encodeControlMessage(MESSAGE_TYPES.FILE_END, { fileId: fileInfo.id }));
        
        // Wait for receiver to confirm file is fully assembled and verified
        console.log(`[WebRTCTransport] Waiting for FILE_COMPLETE for ${fileInfo.id}...`);
        await this._waitForFileComplete(fileInfo.id);

        this.progress.filesSent++;
        console.log(`[WebRTCTransport] File ${i + 1} finished: ${fileInfo.name}`);
        this._lastAckChunkIndex = 0; // Reset for next file
      }

      if (!this.isTransferCancelled && this.status !== 'FAILED') {
        // Wait for final buffer drain before finishing transfer
        await this._flushBuffer();
        
        console.log('[WebRTCTransport] All files sent and verified. Sending TRANSFER_COMPLETE...');
        this.dataChannel.send(encodeControlMessage(MESSAGE_TYPES.TRANSFER_COMPLETE));

        // Wait for TRANSFER_COMPLETE_ACK
        console.log('[WebRTCTransport] Waiting for TRANSFER_COMPLETE_ACK from receiver...');
      }

    } catch (err) {
      console.error('[WebRTCTransport] File stream error:', err.message, err.stack);
      if (!this.isCompleted) {
        this.onError(new Error(`File transfer failed: ${err.message}`));
        this._updateStatus('FAILED');
      }
    }
  }

  _waitForFileComplete(fileId) {
    return new Promise((resolve, reject) => {
      this._currentFileCompleteResolve = resolve;
      
      // Safety timeout in case receiver silently drops
      this._fileCompleteTimeout = setTimeout(() => {
        if (!this.isTransferCancelled) {
          reject(new Error('Timeout waiting for receiver to verify file.'));
        }
      }, 60000);
    });
  }

  /**
   * Wait for DataChannel buffer to fully drain before proceeding
   */
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

  /**
   * Chunking + Client-side AES-GCM Encryption + Backpressure Control
   * IMPORTANT: Uses this._negotiatedChunkSize (set when DataChannel opens)
   * which MATCHES the totalChunks in the manifest.
   */
  async _sendFileInChunks(fileInfo, startChunkIndex = 0) {
    const file = fileInfo.raw;
    const chunkSize = this._negotiatedChunkSize;
    const totalChunks = fileInfo.totalChunks;

    const DYNAMIC_HIGH_WATER_MARK = 256 * 1024;
    const DYNAMIC_LOW_WATER_MARK = 64 * 1024;

    this.dataChannel.bufferedAmountLowThreshold = DYNAMIC_LOW_WATER_MARK;
    this._lastAckBytes = startChunkIndex * chunkSize; // Start from where we left off
    this._filePlaintextBytesSent = startChunkIndex * chunkSize;

    if (startChunkIndex > 0) {
      console.log(`[WebRTCTransport] Resuming ${fileInfo.name} from chunk ${startChunkIndex}/${totalChunks}`);
    }

    for (let chunkIndex = startChunkIndex; chunkIndex < totalChunks; chunkIndex++) {
      if (this.isTransferCancelled || this.status === 'FAILED') throw new Error('Transfer cancelled or failed');

      // 1. PAUSE when ICE connection is unhealthy (disconnected/failed)
      // This is critical: continuing to push data when the network is struggling
      // prevents ICE keepalives from getting through and guarantees failure
      if (!this._iceHealthy) {
        console.log(`[WebRTCTransport] ICE unhealthy at chunk ${chunkIndex}/${totalChunks} — pausing send loop...`);
        let waitMs = 0;
        while (!this._iceHealthy && !this.isTransferCancelled && this.status !== 'FAILED') {
          await new Promise(r => setTimeout(r, 200));
          waitMs += 200;
          if (waitMs > 45000) {
            console.error('[WebRTCTransport] ICE did not recover within 45s during send loop.');
            break;
          }
        }
        if (!this._iceHealthy) throw new Error('ICE connection lost during transfer');
        console.log(`[WebRTCTransport] ICE recovered after ${waitMs}ms — resuming send.`);
      }

      // 2. Check DataChannel is still alive
      if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
        console.error('[WebRTCTransport] DataChannel not open at chunk', chunkIndex);
        throw new Error('DataChannel closed during transfer');
      }

      // 3. WebRTC DataChannel backpressure — wait if SCTP buffer is building up
      if (this.dataChannel.bufferedAmount > DYNAMIC_HIGH_WATER_MARK) {
        await this._waitForBufferDrain(DYNAMIC_LOW_WATER_MARK);
      }

      // 4. Application-level Flow Control (2MB window)
      const MAX_IN_FLIGHT = 2 * 1024 * 1024;
      while ((this._filePlaintextBytesSent - this._lastAckBytes) > MAX_IN_FLIGHT) {
        if (this.isTransferCancelled || this.status === 'FAILED') break;
        this._updateProgressStats();
        await new Promise(r => setTimeout(r, 50));
      }

      // 5. Read and encrypt chunk
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

      // 6. Send with retry
      let sent = false;
      while (!sent) {
        if (this.isTransferCancelled || this.status === 'FAILED') throw new Error('Transfer cancelled or failed');
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') throw new Error('DataChannel closed during send');
        try {
          this.dataChannel.send(packet);
          sent = true;
        } catch (e) {
          if (e.name === 'TypeError' || e.name === 'OperationError' || (e.message && e.message.toLowerCase().includes('buffer'))) {
            console.warn(`[WebRTCTransport] Send error on chunk ${chunkIndex}, backing off...`);
            await new Promise(r => setTimeout(r, 100));
            if (this.dataChannel && this.dataChannel.bufferedAmount > DYNAMIC_HIGH_WATER_MARK) {
              await this._waitForBufferDrain(DYNAMIC_LOW_WATER_MARK);
            }
          } else {
            throw e;
          }
        }
      }

      this._filePlaintextBytesSent += chunkPlaintextSize;
      this.progress.sentBytes += chunkPlaintextSize;
      this._bytesSinceLastUpdate += chunkPlaintextSize;

      this._updateProgressStats();

      // 7. CRITICAL: Yield to the browser event loop every 5 chunks
      // This allows ICE STUN keepalive responses to be processed.
      // Without this, the tight send loop starves the ICE agent and
      // the connection times out even though data is flowing.
      if (chunkIndex % 5 === 0) {
        await new Promise(r => setTimeout(r, 0));
      }
    }
  }

  /**
   * Wait for DataChannel buffer to drain below lowWaterMark
   */
  _waitForBufferDrain(lowWaterMark) {
    return new Promise((resolve) => {
      if (!this.dataChannel || this.dataChannel.bufferedAmount <= lowWaterMark) {
        return resolve();
      }

      this.dataChannel.bufferedAmountLowThreshold = lowWaterMark;
      let done = false;

      const cleanup = () => {
        if (!done) {
          done = true;
          if (this.dataChannel) {
            this.dataChannel.removeEventListener('bufferedamountlow', onLow);
          }
          if (timer) clearInterval(timer);
          resolve();
        }
      };

      const onLow = () => cleanup();

      // Backup polling in case browser doesn't fire 'bufferedamountlow' and to update UI progress while draining
      const timer = setInterval(() => {
        this._updateProgressStats();
        if (!this.dataChannel || this.dataChannel.bufferedAmount <= lowWaterMark) {
          cleanup();
        }
      }, 50);

      this.dataChannel.addEventListener('bufferedamountlow', onLow);
    });
  }

  _updateProgressStats() {
    const now = Date.now();
    const dt = (now - this._lastUpdate) / 1000;

    // Initialize track variable for actual sent bytes if undefined
    if (this._lastActualSentBytes === undefined) {
      this._lastActualSentBytes = 0;
    }

    // Update UI every 100ms for smooth progress
    if (dt >= 0.1) {
      // Calculate actual bytes transferred over the wire
      const buffered = this.dataChannel ? this.dataChannel.bufferedAmount : 0;
      const actualSentBytes = Math.max(0, this.progress.sentBytes - buffered);

      // Speed calculation (bytes per second over wire)
      const currentSpeed = Math.max(0, actualSentBytes - this._lastActualSentBytes) / dt;
      
      this._speedHistory.push(currentSpeed);
      if (this._speedHistory.length > 10) this._speedHistory.shift();

      const rollingSpeed = this._speedHistory.reduce((a, b) => a + b, 0) / this._speedHistory.length;
      this.progress.speed = rollingSpeed;

      const remainingBytes = this.progress.totalBytes - actualSentBytes;
      this.progress.eta = rollingSpeed > 0 ? remainingBytes / rollingSpeed : 0;
      
      // Calculate true overall percentage
      this.progress.percentage = Math.min(100, Math.max(0, (actualSentBytes / this.progress.totalBytes) * 100));

      this._lastUpdate = now;
      this._lastActualSentBytes = actualSentBytes;

      this.onProgress({ ...this.progress });
    }
  }

  async cancelPortal() {
    console.log('[WebRTCTransport] Cancelling portal transfer session');
    this.isTransferCancelled = true;
    this._stopHeartbeat();

    if (this._connectionTimeout) {
      clearTimeout(this._connectionTimeout);
      this._connectionTimeout = null;
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
