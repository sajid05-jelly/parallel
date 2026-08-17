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

    this.peerConnection = null;
    this.dataChannel = null;
    this.signaling = null;

    this.manifest = null;
    this.receivedFiles = new Map(); // fileId -> { info, chunks: Map(index -> ArrayBuffer), receivedBytes: 0 }

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

    // 1. Import AES key from URL fragment
    if (keyString) {
      this.encryptionKey = await importEncryptionKey(keyString);
    }

    // 2. Validate session & claim receiver slot in database
    const { session, receiverCredential, error } = await connectReceiver(token);
    if (error || !session) {
      throw error || new Error('Portal expired or unavailable');
    }

    this.session = session;
    this.sessionId = session.id;

    // 3. Initialize Signaling
    this.signaling = new SupabaseSignaling(this.sessionId, 'receiver');
    this._iceCandidateQueue = [];

    await this.signaling.subscribe({
      onOffer: async (offerSdp) => {
        console.log('[ReceiverTransport] Received Offer SDP from sender');
        await this._handleOffer(offerSdp);
      },
      onIceCandidate: async (candidate) => {
        console.log('[ReceiverTransport] Received ICE candidate from sender');
        if (this.peerConnection && candidate) {
          if (!this.peerConnection.remoteDescription) {
            console.log('[ReceiverTransport] Remote description not set yet. Queuing ICE candidate.');
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
        this.cancel();
      }
    });

    this._setupPeerConnection();
    this._updateStatus('NEGOTIATING');

    // Notify sender that receiver claimed the portal
    await this.signaling.sendSignal('RECEIVER_CLAIMED', { credential: receiverCredential });

    // 30-second debug connection timeout trigger
    this._connectionTimeout = setTimeout(() => {
      if (this.status !== 'CONNECTED' && this.status !== 'TRANSFERRING' && this.status !== 'COMPLETED') {
        console.warn('[ReceiverTransport] Connection timed out after 30s');
        this.onError(new Error('Couldn\'t establish connection. Connection timed out after 30s. Check your network or firewall settings.'));
        this._updateStatus('FAILED');
      }
    }, 30000);


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
      const state = this.peerConnection.connectionState;
      const iceState = this.peerConnection.iceConnectionState;
      console.log(`[ReceiverTransport] PeerConnection state: ${state}, ICE state: ${iceState}`);
      if (state === 'connected') {
        if (this._connectionTimeout) clearTimeout(this._connectionTimeout);
        this._updateStatus('CONNECTED');
      } else if (state === 'failed') {
        if (this._connectionTimeout) clearTimeout(this._connectionTimeout);
        this._updateStatus('FAILED');
      }
    };


    // Receiver waits for DataChannel created by sender
    this.peerConnection.ondatachannel = (event) => {
      console.log('[ReceiverTransport] RTCDataChannel received from sender');
      this.dataChannel = event.channel;
      this.dataChannel.binaryType = 'arraybuffer';

      this.dataChannel.onopen = () => {
        console.log('[ReceiverTransport] DataChannel open');
        this._updateStatus('CONNECTED');
      };

      this.dataChannel.onmessage = (event) => {
        this._handleDataChannelMessage(event.data);
      };

      this.dataChannel.onerror = (err) => {
        console.error('[ReceiverTransport] DataChannel error:', err);
      };
    };
  }

  async _handleOffer(offerSdp) {
    if (!this.peerConnection) return;

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offerSdp));
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    console.log('[ReceiverTransport] Sending Answer SDP to sender');
    await this.signaling.sendSignal('ANSWER', answer);
  }

  /**
   * Handle incoming DataChannel messages (Manifest, Control, Binary Chunks)
   */
  async _handleDataChannelMessage(data) {
    const msg = decodeMessage(data);

    if (msg.isControl) {
      if (msg.type === MESSAGE_TYPES.MANIFEST) {
        console.log('[ReceiverTransport] Received Manifest:', msg.payload);
        this.manifest = msg.payload;
        this.progress.totalFiles = this.manifest.totalFiles;
        this.progress.totalBytes = this.manifest.totalBytes;
        this._updateStatus('WAITING'); // Waiting for user to click "Receive Everything"
      } else if (msg.type === MESSAGE_TYPES.FILE_START) {
        console.log(`[ReceiverTransport] File transfer started: ${msg.payload.fileId}`);
        const fileInfo = this.manifest.files.find(f => f.id === msg.payload.fileId);
        if (fileInfo) {
          this.progress.currentFile = fileInfo;
          this.receivedFiles.set(fileInfo.id, {
            info: fileInfo,
            chunks: new Map(),
            receivedBytes: 0
          });
        }
      } else if (msg.type === MESSAGE_TYPES.FILE_END) {
        console.log(`[ReceiverTransport] File transfer ended: ${msg.payload.fileId}`);
        await this._assembleAndDownloadFile(msg.payload.fileId);
        this.progress.filesReceived++;
      } else if (msg.type === MESSAGE_TYPES.TRANSFER_COMPLETE) {
        console.log('[ReceiverTransport] Full transfer complete. Sending TRANSFER_COMPLETE_ACK...');
        this.isCompleted = true;
        if (this._connectionTimeout) clearTimeout(this._connectionTimeout);
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
          this.dataChannel.send(encodeControlMessage(MESSAGE_TYPES.TRANSFER_COMPLETE_ACK));
        }
        this._updateStatus('COMPLETED');
        this.onComplete();
      } else if (msg.type === MESSAGE_TYPES.CANCEL) {
        if (!this.isCompleted && this.status !== 'COMPLETED') {
          this.cancel();
        }
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
      const fileInfo = this.manifest?.files?.find(f => f.id === fileId) || { id: fileId, name: 'download', size: 0 };
      fileRecord = { info: fileInfo, chunks: new Map(), receivedBytes: 0 };
      this.receivedFiles.set(fileId, fileRecord);
    }

    let plaintextPayload = payload;

    // Decrypt chunk if encryption key is present
    if (this.encryptionKey) {
      try {
        plaintextPayload = await decryptChunk(this.encryptionKey, payload);
      } catch (err) {
        console.error(`[ReceiverTransport] Decryption failed for chunk ${chunkIndex}:`, err);
        return;
      }
    }

    fileRecord.chunks.set(chunkIndex, plaintextPayload);
    fileRecord.receivedBytes += plaintextPayload.byteLength;

    this.progress.receivedBytes += plaintextPayload.byteLength;
    this._bytesSinceLastUpdate += plaintextPayload.byteLength;

    this._updateProgressStats();
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
    }
  }

  /**
   * Assemble file chunks sequentially into a Blob & trigger browser download
   */
  async _assembleAndDownloadFile(fileId) {
    const fileRecord = this.receivedFiles.get(fileId);
    if (!fileRecord) return;

    const { info, chunks, receivedBytes } = fileRecord;
    
    // Integrity check 1: Ensure total chunk count matches expected count
    if (chunks.size !== info.totalChunks) {
      console.error(`[ReceiverTransport] Integrity check failed for ${info.name}: Chunks received (${chunks.size}) != expected (${info.totalChunks})`);
      this.onError(new Error(`Transfer incomplete for ${info.name}. Missing chunks.`));
      return;
    }

    // Integrity check 2: Ensure received total bytes exactly match original file size
    if (receivedBytes !== info.size) {
      console.error(`[ReceiverTransport] Integrity check failed for ${info.name}: Received bytes (${receivedBytes}) != expected (${info.size})`);
      this.onError(new Error(`Transfer incomplete for ${info.name}. Byte size mismatch.`));
      return;
    }

    const sortedChunks = [];
    for (let i = 0; i < info.totalChunks; i++) {
      const chunk = chunks.get(i);
      if (chunk) sortedChunks.push(chunk);
    }

    const mimeType = info.type || 'application/octet-stream';
    const blob = new Blob(sortedChunks, { type: mimeType });
    
    // Additional Blob size verification
    if (blob.size !== info.size) {
      console.error(`[ReceiverTransport] Blob size verification failed for ${info.name}: Blob size (${blob.size}) != expected (${info.size})`);
      this.onError(new Error(`Transfer incomplete for ${info.name}. Corrupted binary assembly.`));
      return;
    }

    console.log(`[ReceiverTransport] File integrity verified 100% for ${info.name} (${blob.size} bytes)`);
    const file = new File([blob], info.name, { type: mimeType, lastModified: Date.now() });

    if (!this.completedFiles) this.completedFiles = [];
    this.completedFiles.push({ file, blob, filename: info.name, mimeType });

    this._triggerBrowserDownload(blob, info.name, file);

    // Free memory for raw chunks immediately
    this.receivedFiles.delete(fileId);
  }

  saveFileItem(item) {
    if (!item) return Promise.reject(new Error('File not available'));
    return this._triggerBrowserDownload(item.blob, item.filename, item.file, true);
  }

  async _triggerBrowserDownload(blob, filename, fileObj, forceManual = false) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    
    // Create a real File object if not provided
    const targetFile = fileObj || new File([blob], filename, { 
      type: blob.type || 'application/octet-stream',
      lastModified: Date.now() 
    });

    // For iOS Safari: Use Web Share API if available to trigger native "Save Image / Video" Share Sheet
    if (isIOS && navigator.share && navigator.canShare) {
      try {
        if (navigator.canShare({ files: [targetFile] })) {
          await navigator.share({
            files: [targetFile],
            title: filename,
          });
          return;
        }
      } catch (err) {
        // If user cancelled the share sheet, ignore silently
        if (err.name === 'AbortError' || err.message?.includes('cancel') || err.message?.includes('cancellation')) {
          console.log('[ReceiverTransport] User cancelled iOS share sheet.');
          return;
        }
        console.warn('[ReceiverTransport] Native share error, falling back to Blob download:', err);
      }
    }

    // Standard Desktop / Android Blob Download Fallback
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'download';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Retain object URL for 60 seconds so browser download manager finishes read
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      console.error('[ReceiverTransport] Download error:', e);
      throw new Error('Unable to save this file. Please try again.');
    }
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
    console.log('[ReceiverTransport] Cleaning up receiver transport session');
    
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
