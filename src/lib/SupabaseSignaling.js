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
        this.supabaseChannel
          .on('broadcast', { event: 'signal' }, ({ payload }) => {
            this._handleSignalPayload(payload);
          })
          .subscribe((status) => {
            console.log(`[Signaling] Supabase Realtime channel status for ${this.peerRole}: ${status}`);
            if (status === 'SUBSCRIBED') {
              resolve(true);
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
    if (!this._connected) {
      throw new Error(`[Signaling] Cannot send ${type}, WebSocket is not connected`);
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
   * Unsubscribe and cleanup signaling connection
   */
  unsubscribe() {
    console.log(`[Signaling] Unsubscribing channel: ${this.channelName}`);
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
