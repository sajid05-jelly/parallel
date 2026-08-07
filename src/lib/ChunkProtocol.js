import { WEBRTC_CHUNK_SIZE } from '../config/constants';

/**
 * Protocol message types for RTCDataChannel
 */
export const MESSAGE_TYPES = {
  MANIFEST: 'MANIFEST',
  TRANSFER_ACCEPTED: 'TRANSFER_ACCEPTED',
  FILE_START: 'FILE_START',
  FILE_END: 'FILE_END',
  TRANSFER_COMPLETE: 'TRANSFER_COMPLETE',
  TRANSFER_COMPLETE_ACK: 'TRANSFER_COMPLETE_ACK',
  CANCEL: 'CANCEL',
  ERROR: 'ERROR'
};


/**
 * Encodes a JSON object control message as an ArrayBuffer/string payload.
 */
export function encodeControlMessage(type, payload = {}) {
  return JSON.stringify({ type, payload, timestamp: Date.now() });
}

/**
 * Decodes a incoming DataChannel message (string JSON or binary ArrayBuffer).
 */
export function decodeMessage(data) {
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return { isControl: true, ...parsed };
    } catch (e) {
      return { isControl: false, data };
    }
  }

  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    const buffer = data instanceof ArrayBuffer ? data : data.buffer;
    return decodeBinaryChunkHeader(buffer);
  }

  return { isControl: false, data };
}

/**
 * Binary Chunk Header Specification (36 bytes total):
 * --------------------------------------------------
 * Bytes 0-15:  fileId (UUID represented as ASCII 36 chars OR hashed 16-byte buffer)
 * Bytes 16-19: fileIndex (Uint32, 4 bytes)
 * Bytes 20-23: chunkIndex (Uint32, 4 bytes)
 * Bytes 24-27: totalChunks (Uint32, 4 bytes)
 * Bytes 28-31: payloadLength (Uint32, 4 bytes)
 * Bytes 32+:   Encrypted or raw chunk binary payload
 *
 * For simplicity & cross-platform safety:
 * Header: 64 bytes total
 * [0..35]  : fileId ASCII string (36 bytes padded)
 * [36..39] : chunkIndex (Uint32)
 * [40..43] : totalChunks (Uint32)
 * [44..47] : payloadLength (Uint32)
 * [48..63] : reserved / padding
 * [64..]   : binary payload
 */

const HEADER_SIZE = 64;

export function encodeBinaryChunk({ fileId, chunkIndex, totalChunks, payloadBuffer }) {
  const payloadBytes = new Uint8Array(payloadBuffer);
  const totalLength = HEADER_SIZE + payloadBytes.byteLength;
  const chunkBuffer = new ArrayBuffer(totalLength);
  
  const view = new DataView(chunkBuffer);
  const bytes = new Uint8Array(chunkBuffer);

  // Encode fileId ASCII (up to 36 chars)
  const encoder = new TextEncoder();
  const fileIdBytes = encoder.encode(fileId.substring(0, 36));
  bytes.set(fileIdBytes, 0);

  // Write integer metadata
  view.setUint32(36, chunkIndex, false); // Big-endian
  view.setUint32(40, totalChunks, false);
  view.setUint32(44, payloadBytes.byteLength, false);

  // Set binary payload starting at offset 64
  bytes.set(payloadBytes, HEADER_SIZE);

  return chunkBuffer;
}

export function decodeBinaryChunkHeader(arrayBuffer) {
  if (arrayBuffer.byteLength < HEADER_SIZE) {
    return { isControl: false, isBinaryChunk: false, data: arrayBuffer };
  }

  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);

  // Read fileId ASCII
  const decoder = new TextDecoder();
  let fileId = decoder.decode(bytes.subarray(0, 36)).replace(/\0/g, '').trim();

  const chunkIndex = view.getUint32(36, false);
  const totalChunks = view.getUint32(40, false);
  const payloadLength = view.getUint32(44, false);

  const payload = arrayBuffer.slice(HEADER_SIZE, HEADER_SIZE + payloadLength);

  return {
    isControl: false,
    isBinaryChunk: true,
    fileId,
    chunkIndex,
    totalChunks,
    payloadLength,
    payload
  };
}
