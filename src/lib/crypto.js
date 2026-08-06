/**
 * Utility functions for base64url encoding and decoding
 */
export function base64urlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64urlDecode(base64urlString) {
  let base64 = base64urlString.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (base64.length % 4)) % 4;
  base64 += '='.repeat(padLength);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Generates a 256-bit AES-GCM encryption key.
 * @returns {Promise<{ key: CryptoKey, keyString: string }>}
 */
export async function generateEncryptionKey() {
  const key = await window.crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    true,
    ['encrypt', 'decrypt']
  );
  
  const rawKey = await window.crypto.subtle.exportKey('raw', key);
  const keyString = base64urlEncode(rawKey);
  
  return { key, keyString };
}

/**
 * Imports a base64url encoded key string back into a CryptoKey.
 * @param {string} keyString 
 * @returns {Promise<CryptoKey>}
 */
export async function importEncryptionKey(keyString) {
  const rawKey = base64urlDecode(keyString);
  return await window.crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM' },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a chunk of data using AES-GCM.
 * @param {CryptoKey} key 
 * @param {ArrayBuffer} data 
 * @returns {Promise<ArrayBuffer>} The encrypted data with the 12-byte IV prepended.
 */
export async function encryptChunk(key, data) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    data
  );
  
  const result = new Uint8Array(iv.length + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), iv.length);
  
  return result.buffer;
}

/**
 * Decrypts a chunk of data using AES-GCM.
 * @param {CryptoKey} key 
 * @param {ArrayBuffer} encryptedData - The encrypted data with the 12-byte IV prepended.
 * @returns {Promise<ArrayBuffer>} The decrypted plaintext data.
 */
export async function decryptChunk(key, encryptedData) {
  const encryptedBytes = new Uint8Array(encryptedData);
  const iv = encryptedBytes.slice(0, 12);
  const ciphertext = encryptedBytes.slice(12);
  
  return await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    ciphertext
  );
}
