// src/lib/TransferState.js

export const TRANSFER_STATES = Object.freeze({
  IDLE: 'IDLE',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  TRANSFERRING: 'TRANSFERRING',
  RECOVERING: 'RECOVERING',
  COMPLETING: 'COMPLETING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED'
});

/**
 * Simple state machine for a transfer session.
 * Provides callbacks for external UI/hook integration.
 */
export class TransferState {
  constructor({ onStatusChange, onProgress, onError } = {}) {
    this.status = TRANSFER_STATES.IDLE;
    this.lastAck = { fileId: null, chunkIdx: -1 };
    this.onStatusChange = onStatusChange || (() => {});
    this.onProgress = onProgress || (() => {});
    this.onError = onError || (() => {});
    this._recoveryStart = null;
    this._recoveryWatchdog = null;
  }

  setStatus(newStatus) {
    if (this.status === newStatus) return;
    this.status = newStatus;
    this.onStatusChange(newStatus);
    if (newStatus === TRANSFER_STATES.RECOVERING) {
      this._recoveryStart = Date.now();
    } else {
      this._clearRecoveryWatchdog();
    }
  }

  recordAck(fileId, chunkIdx) {
    this.lastAck = { fileId, chunkIdx };
    // expose via progress if needed by external callers
    this.onProgress({ lastAck: this.lastAck });
  }

  getLastAck() {
    return this.lastAck;
  }

  startRecoveryWatchdog(timeoutMs = 30000) {
    this._clearRecoveryWatchdog();
    this._recoveryWatchdog = setTimeout(() => {
      this.setStatus(TRANSFER_STATES.FAILED);
      this.onError(new Error('Recovery timed out after multiple attempts'));
    }, timeoutMs);
  }

  _clearRecoveryWatchdog() {
    if (this._recoveryWatchdog) {
      clearTimeout(this._recoveryWatchdog);
      this._recoveryWatchdog = null;
    }
  }
}

export default TransferState;
