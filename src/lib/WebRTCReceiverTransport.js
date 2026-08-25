import { ICE_SERVERS } from '../config/constants';
import { importEncryptionKey, decryptChunk } from './crypto';
import { getSessionByToken, connectReceiver, updateSession } from './sessionManager';
import { SupabaseSignaling } from './SupabaseSignaling';
import { encodeControlMessage, decodeMessage, MESSAGE_TYPES } from './ChunkProtocol';

export class WebRTCReceiverTransport {
  constructor(options = {}) {
    const { onProgress, onStatusChange, onError, onComplete } = options;
    this.onProgress = onProgress || (() => {});
    this.onStatusChange = onStatusChange || (() => {});
    this.onError = onError || (() => {});
    this.onComplete = onComplete || (() => {});

    this.token = null;
    this.keyString = null;
    this.encryptionKey = null;
    this.sessionId = null;
    this.session = null;
    this.status = 'IDLE';
    this.isCompleted = false;
    this.isTransferCancelled = false;

    this.peerConnection = null;
    this.dataChannel = null;
    this.signaling = null;

    this.manifest = null;
    this.receivedFiles = new Map(); // fileId -> { info, chunks, plaintextBytes, ... }
    this.completedFiles = []; // { file, blob, filename, mimeType, fileId }

    // Set of fileIds that have been fully assembled — prevents double-assembly
    this._assembledFileIds = new Set();

    this.progress = {
      totalBytes: 0,
      receivedBytes: 0,
      percentage: 0,
      currentFile: null,
      totalFiles: 0,
      filesReceived: 0,
      speed: 0,
      eta: 0
    };

    this._speedHistory = [];
    this._lastUpdate = Date.now();
    this._bytesSinceLastUpdate = 0;
    this._iceCandidateQueue = [];
    this._connectionTimeout = null;

    // ICE candidate outgoing queue (for signaling during disconnect)
    this._outgoingIceQueue = [];

    // Wake Lock
    this._wakeLock = null;
    this._visibilityHandler = null;

    // Recovery watchdog
    this._recoveryStartTime = 0;
  }

  _updateStatus(newStatus) {
    console.log(`[ReceiverTransport] Status: ${this.status} -> ${newStatus}`);
    this.status = newStatus;
    this.onStatusChange(newStatus);
  }

  // ═══════════════════════════════════════════════════════════
  //  DIAGNOSTIC LOGGING
  // ═══════════════════════════════════════════════════════════

  _logDiagnostics(context) {
    const diag = {
      context,
      timestamp: new Date().toISOString(),
      role: 'receiver',
      connectionState: this.peerConnection?.connectionState || 'none',
      iceConnectionState: this.peerConnection?.iceConnectionState || 'none',
      iceGatheringState: this.peerConnection?.iceGatheringState || 'none',
      signalingState: this.peerConnection?.signalingState || 'none',
      dataChannelState: this.dataChannel?.readyState || 'none',
      currentFile: this.progress.currentFile?.name || 'none',
      receivedBytes: this.progress.receivedBytes,
      totalBytes: this.progress.totalBytes,
      filesReceived: this.progress.filesReceived,
      totalFiles: this.progress.totalFiles,
      signalingConnected: this.signaling?.isConnected ?? 'unknown',
      recoveryStartTime: this._recoveryStartTime ? new Date(this._recoveryStartTime).toISOString() : 'none',
      status: this.status
    };
    console.log('[TRANSFER_DEBUG]', JSON.stringify(diag, null, 2));
  }

  // ═══════════════════════════════════════════════════════════
  //  CONNECT AS RECEIVER
  // ═══════════════════════════════════════════════════════════

  async connect(token, keyString) {
    this.token = token;
    this.keyString = keyString;

    this._updateStatus('CREATING');
    this.receiverInstanceId = Math.random().toString(36).substring(7);

    console.log(`\n[PORTAL CONNECTION]
  portalId: ${this.token}
  receiverInstanceId: ${this.receiverInstanceId}
  existingPeerConnection: ${!!this.peerConnection}
  connectionState: ${this.peerConnection?.connectionState || 'none'}
  transferState: ${this.status}\n`);

    // 1. Import AES key from URL fragment
    if (keyString) {
      this.encryptionKey = await importEncryptionKey(keyString);
    }

    // 2. Validate session & claim receiver slot in database
    let receiverCredential;
    try {
      const result = await connectReceiver(token);
      const session = result.session;
      receiverCredential = result.receiverCredential;
      const error = result.error;

      if (error || !session) {
        throw error || new Error('Portal expired or unavailable');
      }

      this.session = session;
      this.sessionId = session.id;
    } catch (e) {
      if (e.message === 'ALREADY_CONNECTED') {
        console.error(`\n[PORTAL ALREADY CONNECTED]
  portalId: ${this.token}
  receiverInstanceId: ${this.receiverInstanceId}\n`);
      }
      throw e;
    }

    // 3. Initialize Signaling
    this.signaling = new SupabaseSignaling(this.sessionId, 'receiver');
    this._iceCandidateQueue = [];

    await this.signaling.subscribe({
      onAlreadyConnected: () => {
        console.error(`\n[PORTAL ALREADY CONNECTED]
  portalId: ${this.token}
  receiverInstanceId: ${this.receiverInstanceId}
  transferState: ${this.status}\n`);
        if (!this.isCompleted) {
          this.onError(new Error('ALREADY_CONNECTED'));
          this._updateStatus('FAILED');
          this.cancel();
        }
      },
      onOffer: async (offerSdp) => {
        console.log('[ReceiverTransport] Received Offer SDP from sender');
        await this._handleOffer(offerSdp);
      },
      onIceCandidate: async (candidate) => {
        console.log('[ReceiverTransport] Received ICE candidate from sender');
        if (this.peerConnection && candidate) {
          try {
            if (this.peerConnection.remoteDescription) {
              await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
              console.log(`\n[ICE_RECOVERY]\nCANDIDATE_ADDED\n`);
            } else {
              console.log(`\n[ICE_RECOVERY]\nCANDIDATE_QUEUED\ncandidate=${candidate.candidate}\n`);
              this._iceCandidateQueue.push(candidate);
            }
          } catch (e) {
            console.error('[ReceiverTransport] Error adding remote ICE candidate:', e.message);
          }
        }
      },
      onCancel: () => {
        console.log('[ReceiverTransport] Sender cancelled connection');
        if (!this.isCompleted && this.status !== 'COMPLETED') {
          this.cancel();
        }
      }
    });

    this._setupPeerConnection();
    this._updateStatus('NEGOTIATING');

    // Notify sender that receiver claimed the portal
    await this.signaling.sendSignal('RECEIVER_CLAIMED', { credential: receiverCredential });

    // Connection timeout — only fires if data channel never opens
    this._connectionTimeout = setTimeout(() => {
      const safeStates = ['CONNECTED', 'WAITING', 'TRANSFERRING', 'COMPLETED'];
      if (!safeStates.includes(this.status)) {
        console.warn('[ReceiverTransport] Connection timed out after 45s — status:', this.status);
        this.onError(new Error('Could not connect to sender. Check your network and try again.'));
        this._updateStatus('FAILED');
      }
    }, 45000);

    return { session: this.session };
  }

  async _handleOffer(offerSdp) {
    if (!this.peerConnection) return;

    // Guard: skip if we're in the middle of processing another offer
    const sigState = this.peerConnection.signalingState;
    if (sigState === 'have-local-pranswer') {
      console.warn('[ReceiverTransport] Skipping offer — already processing one (signalingState:', sigState, ')');
      return;
    }

    try {
      this._logDiagnostics('OFFER_RECEIVED');
      console.log(`\n[ICE_RECOVERY]
START
connectionState=${this.peerConnection?.connectionState}
iceConnectionState=${this.peerConnection?.iceConnectionState}
signalingState=${sigState}\n`);
      
      console.log('[ReceiverTransport] Setting Remote Description (Offer), signalingState:', sigState);
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offerSdp));
      console.log(`\n[ICE_RECOVERY]\nREMOTE_DESCRIPTION_SET\n`);

      // Process queued ICE candidates now that remote description is set
      const retryQueue = [...this._iceCandidateQueue];
      this._iceCandidateQueue = [];
      for (const cand of retryQueue) {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(cand));
          console.log(`\n[ICE_RECOVERY]\nCANDIDATE_ADDED\n`);
        } catch (e) {
          console.warn('[ReceiverTransport] Still failed to add queued ICE candidate:', e.message);
          this._iceCandidateQueue.push(cand);
        }
      }

      console.log('[ReceiverTransport] Creating Answer SDP');
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      console.log(`\n[ICE_RECOVERY]\nLOCAL_DESCRIPTION_SET\n`);

      console.log('[ReceiverTransport] Sending Answer SDP to sender');
      await this.signaling.sendSignal('ANSWER', answer);
      this._logDiagnostics('ANSWER_SENT');
      console.log(`\n[ICE_RECOVERY]\nWAITING_FOR_CONNECTED\n`);
    } catch (err) {
      console.error('[ReceiverTransport] Error handling offer:', err);
      this._logDiagnostics('OFFER_ERROR');
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  PEER CONNECTION SETUP
  // ═══════════════════════════════════════════════════════════

  _setupPeerConnection() {
    console.log('[ReceiverTransport] Initializing RTCPeerConnection');
    this.peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this._outgoingIceQueue = [];

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.signaling) {
        console.log('[ReceiverTransport] Sending ICE candidate to sender');
        this._outgoingIceQueue.push(event.candidate);
        this._flushOutgoingIceQueue();
      }
    };

    // ── CONNECTION STATE HANDLER ──
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      const iceState = this.peerConnection?.iceConnectionState;
      console.log(`[ReceiverTransport] PeerConnection state: ${state}, ICE: ${iceState}, DC: ${this.dataChannel?.readyState}`);

      if (state === 'connected') {
        if (this._connectionTimeout) {
          clearTimeout(this._connectionTimeout);
          this._connectionTimeout = null;
        }
        this._recoveryStartTime = 0;

        if (this.status === 'RECOVERING') {
          // Only transition when DataChannel is also open
          if (this.dataChannel?.readyState === 'open') {
            console.log(`\n[ICE_RECOVERY]
CONNECTED
connectionState=${this.peerConnection?.connectionState}
iceConnectionState=${this.peerConnection?.iceConnectionState}
dataChannel=${this.dataChannel?.readyState}\n`);
            this._updateStatus('TRANSFERRING');
          } else {
            console.log('[ReceiverTransport] PC connected during recovery but DC not open yet — waiting for ondatachannel');
          }
        } else if (this.status !== 'WAITING' && this.status !== 'TRANSFERRING' && this.status !== 'COMPLETED') {
          this._updateStatus('CONNECTED');
        }

      } else if (state === 'disconnected') {
        this._logDiagnostics('ICE_DISCONNECTED');
        console.warn(`[ReceiverTransport] PeerConnection disconnected — waiting for sender ICE restart.`);
        if (this.status === 'TRANSFERRING' || this.status === 'CONNECTED') {
          this._updateStatus('RECOVERING');
          this._recoveryStartTime = Date.now();
          this._startRecoveryWatchdog();
        }

      } else if (state === 'failed') {
        this._logDiagnostics('ICE_FAILED');
        if (this._connectionTimeout) {
          clearTimeout(this._connectionTimeout);
          this._connectionTimeout = null;
        }
        if (!this.isCompleted && this.status !== 'COMPLETED') {
          if (this.status === 'TRANSFERRING' || this.status === 'CONNECTED') {
            this._updateStatus('RECOVERING');
            this._recoveryStartTime = Date.now();
            this._startRecoveryWatchdog();
          }
        }
      }
    };

    // ── RECEIVE DATA CHANNEL ──
    // This fires both on initial connection AND on recovery (when sender recreates DC).
    // CRITICAL: Do NOT reset any received data. Only accept the new channel.
    this.peerConnection.ondatachannel = (event) => {
      console.log('[ReceiverTransport] DataChannel received from sender');
      this._attachDataChannel(event.channel);
    };
  }

  /**
   * Attach handlers to a DataChannel.
   * Called on initial connection AND on replacement channels during recovery.
   * NEVER resets received file data or progress.
   */
  _attachDataChannel(channel) {
    // Close old channel if it exists and is different
    if (this.dataChannel && this.dataChannel !== channel) {
      try { this.dataChannel.close(); } catch(e) {}
    }

    this.dataChannel = channel;
    this.dataChannel.binaryType = 'arraybuffer';

    this.dataChannel.onopen = () => {
      console.log('[ReceiverTransport] DataChannel open');
      if (this._connectionTimeout) {
        clearTimeout(this._connectionTimeout);
        this._connectionTimeout = null;
      }
      this._recoveryStartTime = 0;

      if (this.status === 'RECOVERING') {
        // Recovery succeeded — resume receiving chunks
        console.log(`\n[ICE_RECOVERY]
CONNECTED
connectionState=${this.peerConnection?.connectionState}
iceConnectionState=${this.peerConnection?.iceConnectionState}
dataChannel=${this.dataChannel?.readyState}\n`);
        this._updateStatus('TRANSFERRING');
      } else if (this.status !== 'WAITING' && this.status !== 'TRANSFERRING' && this.status !== 'COMPLETED') {
        this._updateStatus('CONNECTED');
      }

      this._startHeartbeat();
      this._acquireWakeLock();
    };

    this.dataChannel.onmessage = (event) => {
      this._handleDataChannelMessage(event.data);
    };

    this.dataChannel.onerror = (err) => {
      console.error('[ReceiverTransport] DataChannel error:', err);
    };

    this.dataChannel.onclose = () => {
      console.log('[ReceiverTransport] DataChannel closed. isCompleted:', this.isCompleted, 'status:', this.status);
      this._stopHeartbeat();
      if (!this.isCompleted && (this.status === 'TRANSFERRING' || this.status === 'CONNECTED')) {
        console.warn('[ReceiverTransport] DataChannel closed unexpectedly! Waiting for ICE recovery...');
        this._updateStatus('RECOVERING');
        this._recoveryStartTime = Date.now();
        this._startRecoveryWatchdog();
      }
    };
  }

  // ═══════════════════════════════════════════════════════════
  //  ICE CANDIDATE QUEUE (outgoing, for signaling during disconnect)
  // ═══════════════════════════════════════════════════════════

  async _flushOutgoingIceQueue() {
    if (!this.signaling || this._outgoingIceQueue.length === 0) return;

    const remainingQueue = [];
    for (const candidate of this._outgoingIceQueue) {
      try {
        await this.signaling.sendSignal('ICE_CANDIDATE', candidate);
        console.log('[ReceiverTransport] Successfully sent queued ICE candidate');
      } catch (err) {
        console.warn('[ReceiverTransport] Failed to send ICE candidate (will retry):', err.message);
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
  //  RECOVERY WATCHDOG
  //  If RECOVERING for more than 120s with no DataChannel activity,
  //  declare failure. But does NOT destroy already-received data.
  // ═══════════════════════════════════════════════════════════

  _startRecoveryWatchdog() {
    this._stopRecoveryWatchdog();
    this._recoveryWatchdogInterval = setInterval(() => {
      if (this.status !== 'RECOVERING') {
        this._stopRecoveryWatchdog();
        return;
      }
      if (this.isCompleted || this.isTransferCancelled) {
        this._stopRecoveryWatchdog();
        return;
      }

      const elapsed = Date.now() - this._recoveryStartTime;
      if (elapsed > 120000) {
        console.error(`[RECOVERY WATCHDOG] Recovery timed out after ${Math.round(elapsed/1000)}s`);
        console.log(`\n[ICE_RECOVERY]
FAILED
connectionState=${this.peerConnection?.connectionState}
iceConnectionState=${this.peerConnection?.iceConnectionState}
signalingState=${this.peerConnection?.signalingState}\n`);
        this._stopRecoveryWatchdog();
        this.onError(new Error('Connection to sender lost. Please try again.'));
        this._updateStatus('FAILED');
        this._releaseWakeLock();
      }
    }, 10000);
  }

  _stopRecoveryWatchdog() {
    if (this._recoveryWatchdogInterval) {
      clearInterval(this._recoveryWatchdogInterval);
      this._recoveryWatchdogInterval = null;
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
  //  INCOMING MESSAGE HANDLER
  // ═══════════════════════════════════════════════════════════

  async _handleDataChannelMessage(data) {
    const msg = decodeMessage(data);

    if (msg.isControl) {
      if (msg.type === MESSAGE_TYPES.MANIFEST) {
        console.log('[ReceiverTransport] Received Manifest:', JSON.stringify(msg.payload.files?.map(f => ({ name: f.name, size: f.size, totalChunks: f.totalChunks }))));

        if (this._connectionTimeout) {
          clearTimeout(this._connectionTimeout);
          this._connectionTimeout = null;
        }

        this.manifest = msg.payload;
        this.progress.totalFiles = this.manifest.totalFiles;
        this.progress.totalBytes = this.manifest.totalBytes;
        this._updateStatus('WAITING'); // Waiting for user to click "Receive Everything"

      } else if (msg.type === MESSAGE_TYPES.FILE_START) {
        const fileId = msg.payload.fileId;
        console.log(`[ReceiverTransport] FILE_START: ${fileId}`);
        const fileInfo = this.manifest?.files?.find(f => f.id === fileId);
        if (fileInfo) {
          // ── Idempotent: Do NOT reset if we're already receiving this file ──
          if (!this.receivedFiles.has(fileInfo.id) && !this._assembledFileIds.has(fileId)) {
            this.progress.currentFile = fileInfo;
            this.receivedFiles.set(fileInfo.id, {
              info: fileInfo,
              pendingParts: [],
              pendingPartsSize: 0,
              mergedBlobs: [],
              chunkCount: 0,
              plaintextBytes: 0,
              pendingDecryptions: 0,
              lastAckBytes: 0
            });
          } else {
            // Already receiving or assembled — just update current file reference
            this.progress.currentFile = fileInfo;
          }
        } else {
          console.warn('[ReceiverTransport] FILE_START for unknown fileId:', fileId);
        }

      } else if (msg.type === MESSAGE_TYPES.FILE_END) {
        const fileId = msg.payload.fileId;
        console.log(`[ReceiverTransport] FILE_END: ${fileId}`);

        // ── Idempotent: Only assemble once ──
        if (!this._assembledFileIds.has(fileId)) {
          await this._assembleFile(fileId);
          this.progress.filesReceived++;
        }

        // Always send FILE_COMPLETE (sender may need re-confirmation after recovery)
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
          console.log(`[ReceiverTransport] Sending FILE_COMPLETE for ${fileId}`);
          this.dataChannel.send(encodeControlMessage(MESSAGE_TYPES.FILE_COMPLETE, { fileId }));
        }

      } else if (msg.type === MESSAGE_TYPES.TRANSFER_COMPLETE) {
        console.log('[ReceiverTransport] TRANSFER_COMPLETE received. Verifying all files...');

        if (!this.isCompleted) {
          // Verify all expected files were assembled
          const expectedFiles = this.manifest?.files || [];
          const completedIds = new Set(this.completedFiles.map(f => f.fileId));
          const missing = expectedFiles.filter(f => !completedIds.has(f.id));

          if (missing.length > 0) {
            console.error('[ReceiverTransport] Missing files at TRANSFER_COMPLETE:', missing.map(f => f.name));
          }

          this.isCompleted = true;
          if (this._connectionTimeout) clearTimeout(this._connectionTimeout);
          this._stopRecoveryWatchdog();

          // Send ACK before calling onComplete
          if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(encodeControlMessage(MESSAGE_TYPES.TRANSFER_COMPLETE_ACK));
          }

          this._updateStatus('COMPLETED');
          this._releaseWakeLock();
          this.onComplete();
        } else {
          // Already completed — just re-send ACK in case sender missed it
          if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(encodeControlMessage(MESSAGE_TYPES.TRANSFER_COMPLETE_ACK));
          }
        }

      } else if (msg.type === MESSAGE_TYPES.CANCEL) {
        if (!this.isCompleted && this.status !== 'COMPLETED') {
          console.log('[ReceiverTransport] Sender sent CANCEL');
          this.cancel();
        }
      } else if (msg.type === MESSAGE_TYPES.PING) {
        if (this.dataChannel?.readyState === 'open') {
          this.dataChannel.send(encodeControlMessage(MESSAGE_TYPES.PONG));
        }
      } else if (msg.type === MESSAGE_TYPES.PONG) {
        this._lastPong = Date.now();
      }

    } else if (msg.isBinaryChunk) {
      await this._handleBinaryChunk(msg);
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  BINARY CHUNK HANDLER
  //  Handles duplicate chunks safely for resume scenarios.
  // ═══════════════════════════════════════════════════════════

  async _handleBinaryChunk(chunkMsg) {
    const { fileId, chunkIndex, totalChunks, payload } = chunkMsg;
    let fileRecord = this.receivedFiles.get(fileId);

    if (!fileRecord) {
      // FILE_START may arrive after first chunk on some browsers — handle gracefully
      const fileInfo = this.manifest?.files?.find(f => f.id === fileId) || {
        id: fileId, name: 'download', size: 0, totalChunks, type: 'application/octet-stream'
      };
      fileRecord = {
        info: fileInfo,
        pendingParts: [],
        pendingPartsSize: 0,
        mergedBlobs: [],
        chunkCount: 0,
        plaintextBytes: 0,
        pendingDecryptions: 0,
        lastAckBytes: 0
      };
      this.receivedFiles.set(fileId, fileRecord);
      console.warn('[ReceiverTransport] Received chunk before FILE_START for:', fileId);
    }

    // Initialize if not present (handles FILE_START-created records)
    if (fileRecord.pendingParts === undefined) {
      fileRecord.pendingParts = [];
      fileRecord.pendingPartsSize = 0;
      fileRecord.mergedBlobs = [];
      fileRecord.chunkCount = 0;
    }

    // ── Ignore duplicate chunks during connection resume ──
    if (chunkIndex < fileRecord.chunkCount) {
      // Must still ACK so sender's flow control window doesn't freeze
      if (this.dataChannel?.readyState === 'open') {
        this.dataChannel.send(encodeControlMessage(MESSAGE_TYPES.ACK, {
          fileId,
          receivedBytes: fileRecord.plaintextBytes,
          chunkIndex: fileRecord.chunkCount - 1
        }));
      }
      return;
    }

    if (fileRecord.pendingDecryptions === undefined) {
      fileRecord.pendingDecryptions = 0;
    }
    fileRecord.pendingDecryptions++;

    try {
      let plaintextPayload = payload;

      if (this.encryptionKey) {
        try {
          plaintextPayload = await decryptChunk(this.encryptionKey, payload);
        } catch (err) {
          console.error(`[ReceiverTransport] Decryption failed for chunk ${chunkIndex} of file ${fileId}:`, err);
          return; // Skip this chunk — integrity check will catch it
        }
      }

      // Memory-efficient storage: accumulate ArrayBuffer references
      // and periodically merge into larger Blobs to keep object count bounded.
      fileRecord.pendingParts.push(plaintextPayload);
      fileRecord.pendingPartsSize += plaintextPayload.byteLength;
      fileRecord.chunkCount++;

      // Merge into a single Blob every 4MB to keep memory bounded
      const MERGE_THRESHOLD = 4 * 1024 * 1024;
      if (fileRecord.pendingPartsSize >= MERGE_THRESHOLD) {
        fileRecord.mergedBlobs.push(new Blob(fileRecord.pendingParts));
        fileRecord.pendingParts = [];
        fileRecord.pendingPartsSize = 0;
      }

      fileRecord.plaintextBytes += plaintextPayload.byteLength;

      this.progress.receivedBytes += plaintextPayload.byteLength;
      this._bytesSinceLastUpdate += plaintextPayload.byteLength;

      // Flow control: Send ACK periodically (every 512KB)
      if (fileRecord.plaintextBytes - fileRecord.lastAckBytes >= 512 * 1024) {
        fileRecord.lastAckBytes = fileRecord.plaintextBytes;
        if (this.dataChannel?.readyState === 'open') {
          this.dataChannel.send(encodeControlMessage(MESSAGE_TYPES.ACK, {
            fileId,
            receivedBytes: fileRecord.plaintextBytes,
            chunkIndex
          }));
        }
      }

      this._updateProgressStats();
    } finally {
      fileRecord.pendingDecryptions--;
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  USER ACCEPTS TRANSFER
  // ═══════════════════════════════════════════════════════════

  acceptTransfer() {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      console.log('[ReceiverTransport] Sending TRANSFER_ACCEPTED to sender');
      this.dataChannel.send(encodeControlMessage(MESSAGE_TYPES.TRANSFER_ACCEPTED));
      this._updateStatus('TRANSFERRING');
      this._lastUpdate = Date.now();
      this._bytesSinceLastUpdate = 0;
    } else {
      console.error('[ReceiverTransport] Cannot accept transfer — DataChannel not open. State:', this.dataChannel?.readyState);
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  FILE ASSEMBLY (chunks -> Blob)
  // ═══════════════════════════════════════════════════════════

  async _assembleFile(fileId) {
    // ── Idempotent: never assemble the same file twice ──
    if (this._assembledFileIds.has(fileId)) {
      console.log(`[ReceiverTransport] File ${fileId} already assembled — skipping`);
      return;
    }

    const fileRecord = this.receivedFiles.get(fileId);
    if (!fileRecord) {
      console.error('[ReceiverTransport] _assembleFile: no record for fileId:', fileId);
      return;
    }

    // Wait for any pending async decryptions to finish
    while (fileRecord.pendingDecryptions > 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    const { info, mergedBlobs = [], pendingParts = [], chunkCount = 0 } = fileRecord;

    console.log(`[ReceiverTransport] Assembling: ${info.name} — received ${chunkCount}/${info.totalChunks} chunks, ${mergedBlobs.length} merged blobs + ${pendingParts.length} pending parts`);

    // Integrity check: chunk count must match manifest
    if (chunkCount !== info.totalChunks) {
      const errMsg = `File "${info.name}": received ${chunkCount} chunks but expected ${info.totalChunks}`;
      console.error('[ReceiverTransport] Chunk count mismatch:', errMsg);
      if (!this.isCompleted) {
        this.onError(new Error(errMsg));
      }
      return;
    }

    // Flush any remaining pending parts into the merged array
    if (pendingParts.length > 0) {
      mergedBlobs.push(new Blob(pendingParts));
    }

    const mimeType = info.type || 'application/octet-stream';
    const blob = new Blob(mergedBlobs, { type: mimeType });

    // Blob size must match the original plaintext file size
    if (blob.size !== info.size) {
      const errMsg = `File "${info.name}": assembled ${blob.size} bytes but expected ${info.size} bytes`;
      console.error('[ReceiverTransport] Blob size mismatch:', errMsg);
      if (!this.isCompleted) this.onError(new Error(errMsg));
      return;
    }

    console.log(`[ReceiverTransport] ✓ File verified: ${info.name} (${blob.size} bytes)`);

    const file = new File([blob], info.name, { type: mimeType, lastModified: Date.now() });
    this.completedFiles.push({ file, blob, filename: info.name, mimeType, fileId });

    // Mark as assembled (idempotency)
    this._assembledFileIds.add(fileId);

    // Free raw chunk memory immediately
    this.receivedFiles.delete(fileId);
  }

  // ═══════════════════════════════════════════════════════════
  //  PROGRESS STATS
  // ═══════════════════════════════════════════════════════════

  _updateProgressStats() {
    const now = Date.now();
    const dt = (now - this._lastUpdate) / 1000;

    if (dt >= 0.5) {
      const currentSpeed = this._bytesSinceLastUpdate / dt;
      this._speedHistory.push(currentSpeed);
      if (this._speedHistory.length > 5) this._speedHistory.shift();

      const rollingSpeed = this._speedHistory.reduce((a, b) => a + b, 0) / this._speedHistory.length;
      this.progress.speed = rollingSpeed;

      const remainingBytes = this.progress.totalBytes - this.progress.receivedBytes;
      this.progress.eta = rollingSpeed > 0 ? remainingBytes / rollingSpeed : 0;
      this.progress.percentage = Math.min(100, (this.progress.receivedBytes / this.progress.totalBytes) * 100);

      this._lastUpdate = now;
      this._bytesSinceLastUpdate = 0;

      this.onProgress({ ...this.progress });
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  SCREEN WAKE LOCK
  // ═══════════════════════════════════════════════════════════

  async _acquireWakeLock() {
    if (!('wakeLock' in navigator)) return;
    if (this._wakeLock) return; // Already acquired
    try {
      this._wakeLock = await navigator.wakeLock.request('screen');
      console.log('[WakeLock] Receiver acquired');

      this._visibilityHandler = async () => {
        if (document.visibilityState === 'visible' && !this._wakeLock &&
            (this.status === 'TRANSFERRING' || this.status === 'RECOVERING' || this.status === 'WAITING')) {
          try {
            this._wakeLock = await navigator.wakeLock.request('screen');
            console.log('[WakeLock] Receiver re-acquired after visibility change');
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
      console.log('[WakeLock] Receiver released');
    }
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  CANCEL / CLEANUP
  // ═══════════════════════════════════════════════════════════

  cancel() {
    console.log('[ReceiverTransport] Cancelling receiver transport session');
    this.isTransferCancelled = true;
    this._stopHeartbeat();
    this._stopRecoveryWatchdog();
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

    if (!this.isCompleted && this.status !== 'COMPLETED') {
      this._updateStatus('CANCELLED');
    }
  }
}
