import { supabase } from '../config/supabase';

// Event listener map for local fallback signaling when Supabase credentials are missing
const localSignalingHub = new Map();

/**
 * SupabaseSignaling orchestrates temporary WebRTC offer/answer/ICE candidate exchanges
 * using Supabase Realtime Channels (or local BroadcastChannel fallback for demo/dev mode).
 */
export class SupabaseSignaling {
  constructor(sessionId, peerRole = 'sender') {
    this.sessionId = sessionId;
    this.peerRole = peerRole; // 'sender' or 'receiver'
    this.channelName = `portal_${sessionId}`;
    this.supabaseChannel = null;
    this.broadcastChannel = null;
    this.callbacks = {
      onOffer: null,
      onAnswer: null,
      onIceCandidate: null,
      onReceiverClaimed: null,
      onCancel: null
    };

    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    this.isRealSupabase = Boolean(
      url && key &&
      !url.includes('placeholder.supabase.co') &&
      !key.includes('placeholder-key') &&
      (url.startsWith('http://') || url.startsWith('https://'))
    );

    // Signaling health tracking
    this.isConnected = false;
    this._resubscribeTimer = null;
    this._initialResolve = null;
  }


  /**
   * Subscribe to the session signaling channel
   */
  async subscribe({ onOffer, onAnswer, onIceCandidate, onReceiverClaimed, onCancel } = {}) {
    this.callbacks = { onOffer, onAnswer, onIceCandidate, onReceiverClaimed, onCancel };

    if (this.isRealSupabase) {
      console.log(`[Signaling] Subscribing to Supabase Realtime channel: ${this.channelName}`);
      this.supabaseChannel = supabase.channel(this.channelName);

      return new Promise((resolve) => {
        this._initialResolve = resolve;
        this.supabaseChannel
          .on('broadcast', { event: 'signal' }, ({ payload }) => {
            this._handleSignalPayload(payload);
          })
          .subscribe((status) => {
            console.log(`[Signaling] Supabase Realtime channel status for ${this.peerRole}: ${status}`);
            if (status === 'SUBSCRIBED') {
              this.isConnected = true;
              if (this._initialResolve) {
                this._initialResolve(true);
                this._initialResolve = null;
              }
            } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
              console.warn(`[Signaling] Channel ${status} for ${this.peerRole} — scheduling resubscribe`);
              this.isConnected = false;
              this._scheduleResubscribe();
            }
          });
      });
    } else {

      console.log(`[Signaling] Using BroadcastChannel / Local fallback for channel: ${this.channelName}`);
      try {
        if ('BroadcastChannel' in window) {
          this.broadcastChannel = new BroadcastChannel(this.channelName);
          this.broadcastChannel.onmessage = (event) => {
            this._handleSignalPayload(event.data);
          };
        } else {
          // In-memory fallback for environments without BroadcastChannel
          if (!localSignalingHub.has(this.channelName)) {
            localSignalingHub.set(this.channelName, new Set());
          }
          this._localListener = (payload) => this._handleSignalPayload(payload);
          localSignalingHub.get(this.channelName).add(this._localListener);
        }
      } catch (err) {
        console.warn('[Signaling] Fallback initialization warning:', err);
      }
    }
  }

  /**
   * Send a signaling message
   */
  async sendSignal(type, payload) {
    if (!this.isConnected && this.isRealSupabase) {
      console.warn(`[Signaling] Sending ${type} while signaling channel is disconnected — delivery not guaranteed`);
    }

    const message = {
      type,
      senderRole: this.peerRole,
      payload,
      timestamp: Date.now()
    };

    if (this.isRealSupabase && this.supabaseChannel) {
      const response = await this.supabaseChannel.send({
        type: 'broadcast',
        event: 'signal',
        payload: message
      });
      if (response !== 'ok') {
        throw new Error(`[Signaling] Supabase broadcast failed with status: ${response}`);
      }
    } else {
      if (this.broadcastChannel) {
        this.broadcastChannel.postMessage(message);
      } else if (localSignalingHub.has(this.channelName)) {
        const listeners = localSignalingHub.get(this.channelName);
        listeners.forEach(fn => {
          if (fn !== this._localListener) fn(message);
        });
      }
    }
  }

  _handleSignalPayload(payload) {
    if (!payload || payload.senderRole === this.peerRole) return; // Ignore own messages

    console.log(`[Signaling] Received ${payload.type} from ${payload.senderRole}`);

    switch (payload.type) {
      case 'OFFER':
        if (this.callbacks.onOffer) this.callbacks.onOffer(payload.payload);
        break;
      case 'ANSWER':
        if (this.callbacks.onAnswer) this.callbacks.onAnswer(payload.payload);
        break;
      case 'ICE_CANDIDATE':
        if (this.callbacks.onIceCandidate) this.callbacks.onIceCandidate(payload.payload);
        break;
      case 'RECEIVER_CLAIMED':
        if (this.callbacks.onReceiverClaimed) this.callbacks.onReceiverClaimed(payload.payload);
        break;
      case 'CANCEL':
        if (this.callbacks.onCancel) this.callbacks.onCancel();
        break;
      case 'ALREADY_CONNECTED':
        if (this.callbacks.onAlreadyConnected) this.callbacks.onAlreadyConnected();
        break;
      default:
        break;
    }
  }

  /**
   * Auto-resubscribe when Supabase Realtime channel disconnects.
   * Prevents silent signaling death during transfers.
   */
  _scheduleResubscribe() {
    if (this._resubscribeTimer) return; // Already scheduled
    this._resubscribeTimer = setTimeout(async () => {
      this._resubscribeTimer = null;
      if (this.isConnected) return; // Already recovered

      console.log(`[Signaling] Attempting resubscribe for ${this.peerRole}...`);
      try {
        // Remove old channel
        if (this.supabaseChannel) {
          try { supabase.removeChannel(this.supabaseChannel); } catch (e) {}
        }

        // Create new channel with same broadcast handler
        this.supabaseChannel = supabase.channel(this.channelName);
        this.supabaseChannel
          .on('broadcast', { event: 'signal' }, ({ payload }) => {
            this._handleSignalPayload(payload);
          })
          .subscribe((status) => {
            console.log(`[Signaling] Resubscribe status for ${this.peerRole}: ${status}`);
            if (status === 'SUBSCRIBED') {
              this.isConnected = true;
              console.log(`[Signaling] Resubscribe succeeded for ${this.peerRole}`);
            } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
              this.isConnected = false;
              this._scheduleResubscribe();
            }
          });
      } catch (e) {
        console.error('[Signaling] Resubscribe failed:', e);
        this._scheduleResubscribe();
      }
    }, 3000);
  }

  /**
   * Unsubscribe and cleanup signaling connection
   */
  unsubscribe() {
    console.log(`[Signaling] Unsubscribing channel: ${this.channelName}`);
    this.isConnected = false;
    if (this._resubscribeTimer) {
      clearTimeout(this._resubscribeTimer);
      this._resubscribeTimer = null;
    }
    if (this.supabaseChannel) {
      supabase.removeChannel(this.supabaseChannel);
      this.supabaseChannel = null;
    }
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
    if (this._localListener && localSignalingHub.has(this.channelName)) {
      localSignalingHub.get(this.channelName).delete(this._localListener);
    }
  }
}
