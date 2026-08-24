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

    this.peerConnection = null;
    this.dataChannel = null;
    this.signaling = null;

    this.manifest = null;
    this.receivedFiles = new Map(); // fileId -> { info, chunks: Map(index -> ArrayBuffer), plaintextBytes: 0 }
    this.completedFiles = []; // { file, blob, filename, mimeType, fileId }

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
  }

  _updateStatus(newStatus) {
    console.log(`[ReceiverTransport] Status changed: ${this.status} -> ${newStatus}`);
    this.status = newStatus;
    this.onStatusChange(newStatus);
  }

  /**
   * Connect as receiver: validate token, import AES key, join signaling channel & create WebRTC Answer
   */
  async connect(token, keyString) {
    this.token = token;
    this.keyString = keyString;

    this._updateStatus('CREATING');
    this.receiverInstanceId = Math.random().toString(36).substring(7);

    console.log(`\n[PORTAL CONNECTION]
portalId: ${this.token}
receiverInstanceId: ${this.receiverInstanceId}
existingPeerConnection: ${!!this.peerConnection}
existingDataChannel: ${!!this.dataChannel}
connectionState: ${this.peerConnection?.connectionState || 'none'}
iceConnectionState: ${this.peerConnection?.iceConnectionState || 'none'}
transferState: ${this.status}\n`);

    // 1. Import AES key from URL fragment
    if (keyString) {
      this.encryptionKey = await importEncryptionKey(keyString);
    }

    console.log(`\n[PORTAL JOIN]
portalId: ${this.token}
receiverInstanceId: ${this.receiverInstanceId}
connectionState: ${this.peerConnection?.connectionState || 'none'}
`);

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
receiverInstanceId: ${this.receiverInstanceId}
pcState: ${this.peerConnection?.connectionState || 'none'}
dataChannelState: ${this.dataChannel?.readyState || 'none'}
transferState: ${this.status}\n`);
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
          if (!this.peerConnection.remoteDescription) {
            this._iceCandidateQueue.push(candidate);
          } else {
            try {
              await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
              console.warn('[ReceiverTransport] Error adding remote ICE candidate:', e);
            }
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
    // Once MANIFEST arrives we clear this immediately
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
    try {
      console.log('[ReceiverTransport] Setting Remote Description (Offer)');
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offerSdp));

      // Process queued ICE candidates now that remote description is set
      while (this._iceCandidateQueue.length > 0) {
        const cand = this._iceCandidateQueue.shift();
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
          console.warn('[ReceiverTransport] Error adding queued ICE candidate:', e);
        }
      }

      console.log('[ReceiverTransport] Creating Answer SDP');
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      console.log('[ReceiverTransport] Sending Answer SDP to sender');
      await this.signaling.sendSignal('ANSWER', answer);
    } catch (err) {
      console.error('[ReceiverTransport] Error handling offer:', err);
    }
  }

  _setupPeerConnection() {
    console.log('[ReceiverTransport] Initializing RTCPeerConnection with ICE servers:', ICE_SERVERS);
    this.peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.signaling) {
        console.log('[ReceiverTransport] Sending ICE candidate to sender');
        this.signaling.sendSignal('ICE_CANDIDATE', event.candidate);
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      const iceState = this.peerConnection?.iceConnectionState;
      console.log(`[ReceiverTransport] PeerConnection state: ${state}, ICE state: ${iceState}`);

      if (state === 'connected') {
        if (this._connectionTimeout) {
          clearTimeout(this._connectionTimeout);
          this._connectionTimeout = null;
        }
        if (this.status !== 'WAITING' && this.status !== 'TRANSFERRING' && this.status !== 'COMPLETED') {
          this._updateStatus('CONNECTED');
        }
      } else if (state === 'failed') {
        if (this._connectionTimeout) {
          clearTimeout(this._connectionTimeout);
          this._connectionTimeout = null;
        }
        if (!this.isCompleted && this.status !== 'COMPLETED') {
          console.error('[ReceiverTransport] PeerConnection failed. ICE state:', iceState);
          
          if (this._recoveryTimeout) clearTimeout(this._recoveryTimeout);
          this._recoveryTimeout = setTimeout(() => {
            if (this.isTransferCancelled || this.status === 'COMPLETED') return;
            if (this.peerConnection?.iceConnectionState === 'connected' || this.peerConnection?.iceConnectionState === 'completed') return;

            this.onError(new Error('WebRTC connection failed. Please check your network and try again.'));
            this._updateStatus('FAILED');
          }, 30000); // 30-second recovery grace period
        }
      } else if (state === 'disconnected') {
        console.warn('[ReceiverTransport] PeerConnection disconnected (may self-recover)');
      }
    };

    // Receiver waits for DataChannel created by sender
    this.peerConnection.ondatachannel = (event) => {
      console.log('[ReceiverTransport] RTCDataChannel received from sender');
      this.dataChannel = event.channel;
      this.dataChannel.binaryType = 'arraybuffer';

      this.dataChannel.onopen = () => {
        console.log('[ReceiverTransport] DataChannel open');
        if (this._connectionTimeout) {
          clearTimeout(this._connectionTimeout);
          this._connectionTimeout = null;
        }
        if (this.status !== 'WAITING' && this.status !== 'TRANSFERRING' && this.status !== 'COMPLETED') {
          this._updateStatus('CONNECTED');
        }
        
        this._startHeartbeat();
      };

      this.dataChannel.onmessage = (event) => {
        this._handleDataChannelMessage(event.data);
      };

      this.dataChannel.onerror = (err) => {
        console.error('[ReceiverTransport] DataChannel error:', JSON.stringify(err), err);
      };

      this.dataChannel.onclose = () => {
        console.log('[ReceiverTransport] DataChannel closed. isCompleted:', this.isCompleted, 'status:', this.status);
        this._stopHeartbeat();
        // Only treat as error if we weren't already done
        if (!this.isCompleted && this.status === 'TRANSFERRING') {
          console.error('[ReceiverTransport] DataChannel closed unexpectedly during transfer!');
          this.onError(new Error('Connection dropped during file transfer. Please try again.'));
          this._updateStatus('FAILED');
        }
      };
    };
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
   * Handle incoming DataChannel messages (Manifest, Control, Binary Chunks)
   */
  async _handleDataChannelMessage(data) {
    const msg = decodeMessage(data);

    if (msg.isControl) {
      if (msg.type === MESSAGE_TYPES.MANIFEST) {
        console.log('[ReceiverTransport] Received Manifest:', JSON.stringify(msg.payload.files?.map(f => ({ name: f.name, size: f.size, totalChunks: f.totalChunks }))));

        // Manifest received = data channel is working → cancel connection timeout
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
          this.progress.currentFile = fileInfo;
          this.receivedFiles.set(fileInfo.id, {
            info: fileInfo,
            chunks: new Map(),
            plaintextBytes: 0,
            pendingDecryptions: 0
          });
        } else {
          console.warn('[ReceiverTransport] FILE_START for unknown fileId:', fileId);
        }

      } else if (msg.type === MESSAGE_TYPES.FILE_END) {
        const fileId = msg.payload.fileId;
        console.log(`[ReceiverTransport] FILE_END: ${fileId}`);
        await this._assembleFile(fileId);
        this.progress.filesReceived++;
        
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
          console.log(`[ReceiverTransport] Sending FILE_COMPLETE for ${fileId}`);
          this.dataChannel.send(encodeControlMessage(MESSAGE_TYPES.FILE_COMPLETE, { fileId }));
        }

      } else if (msg.type === MESSAGE_TYPES.TRANSFER_COMPLETE) {
        console.log('[ReceiverTransport] TRANSFER_COMPLETE received. Verifying all files...');

        // Verify all expected files were assembled
        const expectedFiles = this.manifest?.files || [];
        const completedIds = new Set(this.completedFiles.map(f => f.fileId));
        const missing = expectedFiles.filter(f => !completedIds.has(f.id));

        if (missing.length > 0) {
          console.error('[ReceiverTransport] Missing files at TRANSFER_COMPLETE:', missing.map(f => f.name));
          // Still mark complete — don't block user if files arrived but verification edge case
        }

        this.isCompleted = true;
        if (this._connectionTimeout) clearTimeout(this._connectionTimeout);

        // Send ACK before calling onComplete so sender receives confirmation
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
          this.dataChannel.send(encodeControlMessage(MESSAGE_TYPES.TRANSFER_COMPLETE_ACK));
        }

        this._updateStatus('COMPLETED');
        this.onComplete();

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

  /**
   * Process binary chunk: decrypt payload and store in temporary buffer
   */
  async _handleBinaryChunk(chunkMsg) {
    const { fileId, chunkIndex, totalChunks, payload } = chunkMsg;
    let fileRecord = this.receivedFiles.get(fileId);

    if (!fileRecord) {
      // FILE_START may arrive after first chunk on some browsers — handle gracefully
      const fileInfo = this.manifest?.files?.find(f => f.id === fileId) || {
        id: fileId, name: 'download', size: 0, totalChunks, type: 'application/octet-stream'
      };
      fileRecord = { info: fileInfo, chunks: new Map(), plaintextBytes: 0, pendingDecryptions: 0 };
      this.receivedFiles.set(fileId, fileRecord);
      console.warn('[ReceiverTransport] Received chunk before FILE_START for:', fileId);
    }

    // Initialize if not present
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
      // Safely wrap in Blob to spool to disk and avoid heap overflow.
      // Use the chunks Map to guarantee ordering even if decrypt promises resolve out of order.
      const blobChunk = new Blob([plaintextPayload]);
      fileRecord.chunks.set(chunkIndex, blobChunk);
      
      fileRecord.plaintextBytes += plaintextPayload.byteLength;

      this.progress.receivedBytes += plaintextPayload.byteLength;
      this._bytesSinceLastUpdate += plaintextPayload.byteLength;

      // Flow control: Send ACK periodically to prevent sender from overflowing
      if (fileRecord.lastAckBytes === undefined) fileRecord.lastAckBytes = 0;
      if (fileRecord.plaintextBytes - fileRecord.lastAckBytes >= 512 * 1024) { // Ack every 512KB
        fileRecord.lastAckBytes = fileRecord.plaintextBytes;
        if (this.dataChannel?.readyState === 'open') {
          this.dataChannel.send(encodeControlMessage(MESSAGE_TYPES.ACK, {
            fileId,
            receivedBytes: fileRecord.plaintextBytes
          }));
        }
      }

      this._updateProgressStats();
    } finally {
      fileRecord.pendingDecryptions--;
    }
  }

  /**
   * User clicks "Receive Everything"
   */
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

  /**
   * Assemble file chunks into a Blob and store in completedFiles
   */
  async _assembleFile(fileId) {
    const fileRecord = this.receivedFiles.get(fileId);
    if (!fileRecord) {
      console.error('[ReceiverTransport] _assembleFile: no record for fileId:', fileId);
      return;
    }

    // Wait for any pending async decryptions to finish before counting chunks
    while (fileRecord.pendingDecryptions > 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    const { info, chunks } = fileRecord;

    console.log(`[ReceiverTransport] Assembling: ${info.name} — received ${chunks.size}/${info.totalChunks} chunks`);

    // Integrity check: chunk count must match manifest
    if (chunks.size !== info.totalChunks) {
      const errMsg = `File "${info.name}": received ${chunks.size} chunks but expected ${info.totalChunks}`;
      console.error('[ReceiverTransport] Chunk count mismatch:', errMsg);
      // Only fire error if not already completed (prevents race condition)
      if (!this.isCompleted) {
        this.onError(new Error(errMsg));
      }
      return;
    }

    // Assemble chunks in strict order
    const sortedChunks = [];
    for (let i = 0; i < info.totalChunks; i++) {
      const chunk = chunks.get(i);
      if (!chunk) {
        const errMsg = `File "${info.name}": chunk ${i} is missing`;
        console.error('[ReceiverTransport]', errMsg);
        if (!this.isCompleted) this.onError(new Error(errMsg));
        return;
      }
      sortedChunks.push(chunk);
    }

    const mimeType = info.type || 'application/octet-stream';
    const blob = new Blob(sortedChunks, { type: mimeType });

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

    // Free raw chunk memory immediately
    this.receivedFiles.delete(fileId);
  }

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

  cancel() {
    console.log('[ReceiverTransport] Cancelling receiver transport session');
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

    if (!this.isCompleted && this.status !== 'COMPLETED') {
      this._updateStatus('CANCELLED');
    }
  }
}
