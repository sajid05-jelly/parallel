import { ICE_SERVERS, WEBRTC_CHUNK_SIZE, HIGH_WATER_MARK, LOW_WATER_MARK } from '../config/constants';
import { generateEncryptionKey, encryptChunk, base64urlEncode } from './crypto';
import { createSession, updateSession, cancelSession } from './sessionManager';
import { SupabaseSignaling } from './SupabaseSignaling';
import { encodeControlMessage, encodeBinaryChunk, decodeMessage, MESSAGE_TYPES } from './ChunkProtocol';

export class WebRTCTransport {
  constructor(options = {}) {
    const { onProgress, onStatusChange, onError, onComplete } = options;
    this.onProgress = onProgress || (() => {});
    this.onStatusChange = onStatusChange || (() => {});
    this.onError = onError || (() => {});
    this.onComplete = onComplete || (() => {});

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
  }

  setFiles(fileList) {
    this.files = Array.from(fileList).map(file => {
      const totalChunks = Math.ceil(file.size / WEBRTC_CHUNK_SIZE);
      return {
        raw: file,
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        totalChunks
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
        console.log('[WebRTCTransport] Receiver claimed portal. Re-broadcasting WebRTC Offer.');
        this._updateStatus('NEGOTIATING');
        if (this.peerConnection && this.peerConnection.localDescription) {
          await this.signaling.sendSignal('OFFER', this.peerConnection.localDescription);
        }
      },
      onCancel: () => {
        console.log('[WebRTCTransport] Receiver cancelled connection');
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

    // 30-second debug connection timeout trigger
    this._connectionTimeout = setTimeout(() => {
      if (this.status !== 'CONNECTED' && this.status !== 'TRANSFERRING' && this.status !== 'COMPLETED') {
        console.warn('[WebRTCTransport] Connection timed out after 30s');
        this.onError(new Error('Couldn\'t establish connection. Connection timed out after 30s. Check your network or firewall settings.'));
        this._updateStatus('FAILED');
      }
    }, 30000);


    const origin = window.location.origin;
    const url = `${origin}/receive/${this.token}#key=${this.keyString}`;
    const expiresAt = new Date(Date.now() + 120 * 1000).toISOString();

    return { token: this.token, keyString: this.keyString, sessionId: this.sessionId, url, expiresAt };
  }

  _setupPeerConnection() {
    console.log('[WebRTCTransport] Initializing RTCPeerConnection with ICE servers:', ICE_SERVERS);
    this.peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Handle ICE Candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.signaling) {
        console.log('[WebRTCTransport] Sending ICE candidate to receiver');
        this.signaling.sendSignal('ICE_CANDIDATE', event.candidate);
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      const iceState = this.peerConnection.iceConnectionState;
      console.log(`[WebRTCTransport] PeerConnection state: ${state}, ICE state: ${iceState}`);
      if (state === 'connected') {
        if (this._connectionTimeout) clearTimeout(this._connectionTimeout);
        if (this.status !== 'TRANSFERRING' && this.status !== 'COMPLETED') {
          this._updateStatus('CONNECTED');
        }
      } else if (state === 'failed') {
        if (this._connectionTimeout) clearTimeout(this._connectionTimeout);
        if (!this.isCompleted && this.status !== 'COMPLETED') {
          this._updateStatus('FAILED');
        }
      }
    };



    // Sender creates DataChannel
    this.dataChannel = this.peerConnection.createDataChannel('parallel-transfer', {
      ordered: true
    });
    this.dataChannel.binaryType = 'arraybuffer';

    this.dataChannel.onopen = () => {
      console.log('[WebRTCTransport] RTCDataChannel opened successfully');
      this._updateStatus('CONNECTED');
      this._sendManifest();
    };

    this.dataChannel.onmessage = (event) => {
      this._handleDataChannelMessage(event.data);
    };

    this.dataChannel.onerror = (err) => {
      console.error('[WebRTCTransport] DataChannel error:', err);
    };

    this.dataChannel.onclose = () => {
      console.log('[WebRTCTransport] DataChannel closed');
    };
  }

  /**
   * Send JSON Manifest over DataChannel to receiver
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
        totalChunks: f.totalChunks
      }))
    };

    console.log('[WebRTCTransport] Sending manifest over DataChannel');
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
      console.log('[WebRTCTransport] Received TRANSFER_COMPLETE_ACK from receiver. Finalizing transfer success.');
      this.isCompleted = true;
      if (this._connectionTimeout) clearTimeout(this._connectionTimeout);
      this._updateStatus('COMPLETED');
      this.onComplete({ token: this.token, keyString: this.keyString, sessionId: this.sessionId });
    } else if (msg.type === MESSAGE_TYPES.CANCEL) {
      if (!this.isCompleted && this.status !== 'COMPLETED') {
        console.log('[WebRTCTransport] Receiver requested transfer cancellation');
        this.cancelPortal();
      }
    }
  }


  /**
   * Stream files with WebRTC Backpressure control & Slice Reading
   */
  async _startFileStream() {
    try {
      this._lastUpdate = Date.now();
      this._bytesSinceLastUpdate = 0;

      for (let i = 0; i < this.files.length; i++) {
        if (this.isTransferCancelled) break;
        const fileInfo = this.files[i];
        this.progress.currentFile = fileInfo;

        // Signal FILE_START
        this.dataChannel.send(encodeControlMessage(MESSAGE_TYPES.FILE_START, { fileId: fileInfo.id }));

        await this._sendFileInChunks(fileInfo);

        if (this.isTransferCancelled) break;

        // Signal FILE_END
        this.dataChannel.send(encodeControlMessage(MESSAGE_TYPES.FILE_END, { fileId: fileInfo.id }));
        this.progress.filesSent++;
      }

      if (!this.isTransferCancelled) {
        // Wait until all binary chunk bytes have actually flushed out of WebRTC DataChannel buffer
        while (this.dataChannel && this.dataChannel.bufferedAmount > 0) {
          await new Promise((r) => setTimeout(r, 50));
        }

        // Signal TRANSFER_COMPLETE
        this.dataChannel.send(encodeControlMessage(MESSAGE_TYPES.TRANSFER_COMPLETE));
        await updateSession(this.sessionId, { status: 'COMPLETED' });
        this._updateStatus('COMPLETED');
        this.onComplete({ token: this.token, keyString: this.keyString, sessionId: this.sessionId });
      }

    } catch (err) {
      console.error('[WebRTCTransport] File stream error:', err);
      this.onError(err);
      this._updateStatus('FAILED');
    }
  }

  /**
   * Chunking + Client-side Encryption + Backpressure Control
   */
  async _sendFileInChunks(fileInfo) {
    const file = fileInfo.raw;
    const chunkSize = WEBRTC_CHUNK_SIZE;
    const totalChunks = fileInfo.totalChunks;

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      if (this.isTransferCancelled) break;

      // 1. Backpressure Check: Pause only when buffer hits 8MB ceiling
      if (this.dataChannel.bufferedAmount > HIGH_WATER_MARK) {
        await this._waitForBufferDrain();
      }



      // 2. Slice file incrementally from disk (bounded RAM usage)
      const start = chunkIndex * chunkSize;
      const end = Math.min(file.size, start + chunkSize);
      const blobSlice = file.slice(start, end);
      const rawArrayBuffer = await blobSlice.arrayBuffer();

      // 3. Application-level AES-GCM Encryption
      const encryptedChunkPayload = await encryptChunk(this.encryptionKey, rawArrayBuffer);

      // 4. Pack into Binary Chunk Header
      const packet = encodeBinaryChunk({
        fileId: fileInfo.id,
        chunkIndex,
        totalChunks,
        payloadBuffer: encryptedChunkPayload
      });

      // 5. Send over DataChannel
      this.dataChannel.send(packet);

      // 6. Update progress tracking
      const bytesSentThisChunk = end - start;
      this.progress.sentBytes += bytesSentThisChunk;
      this._bytesSinceLastUpdate += bytesSentThisChunk;

      this._updateProgressStats();
    }
  }

  /**
   * Wait for DataChannel buffer to drain below LOW_WATER_MARK
   */
  _waitForBufferDrain() {
    return new Promise((resolve) => {
      this.dataChannel.bufferedAmountLowThreshold = LOW_WATER_MARK;
      const onLow = () => {
        this.dataChannel.removeEventListener('bufferedamountlow', onLow);
        resolve();
      };
      this.dataChannel.addEventListener('bufferedamountlow', onLow);
    });
  }

  _updateProgressStats() {
    const now = Date.now();
    const dt = (now - this._lastUpdate) / 1000;

    if (dt >= 0.5) { // Update stats every 500ms
      const currentSpeed = this._bytesSinceLastUpdate / dt;
      this._speedHistory.push(currentSpeed);
      if (this._speedHistory.length > 5) this._speedHistory.shift();

      const rollingSpeed = this._speedHistory.reduce((a, b) => a + b, 0) / this._speedHistory.length;
      this.progress.speed = rollingSpeed;

      const remainingBytes = this.progress.totalBytes - this.progress.sentBytes;
      this.progress.eta = rollingSpeed > 0 ? remainingBytes / rollingSpeed : 0;
      this.progress.percentage = Math.min(100, (this.progress.sentBytes / this.progress.totalBytes) * 100);

      this._lastUpdate = now;
      this._bytesSinceLastUpdate = 0;

      this.onProgress({ ...this.progress });
    }
  }

  async cancelPortal() {
    console.log('[WebRTCTransport] Cleaning up portal transfer session');
    this.isTransferCancelled = true;

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
        // ignore idempotent close errors
      }
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch (e) {
        // ignore idempotent close errors
      }
      this.peerConnection = null;
    }

    if (this.signaling) {
      try {
        this.signaling.unsubscribe();
      } catch (e) {
        // ignore idempotent unsubscribe errors
      }
      this.signaling = null;
    }

    if (this.sessionId) {
      await cancelSession(this.sessionId);
    }

    if (!this.isCompleted && this.status !== 'COMPLETED') {
      this._updateStatus('CANCELLED');
    }
  }
}
