export const MAX_FILE_SIZE = Number(import.meta.env.VITE_MAX_FILE_SIZE) || 524288000; // 500MB
export const MAX_TRANSFER_SIZE = Number(import.meta.env.VITE_MAX_TRANSFER_SIZE) || 1073741824; // 1GB  
export const MAX_FILES_PER_TRANSFER = Number(import.meta.env.VITE_MAX_FILES_PER_TRANSFER) || 50;

// WebRTC DataChannel chunking configuration (16KB raw chunk slice guarantees <= 64KB maxMessageSize across Safari/Firefox/Chrome)
export const WEBRTC_CHUNK_SIZE = Number(import.meta.env.VITE_WEBRTC_CHUNK_SIZE) || 16384; // 16KB for 100% WebRTC browser compatibility
export const HIGH_WATER_MARK = 8 * 1024 * 1024; // 8MB buffer ceiling for fast streaming throughput
export const LOW_WATER_MARK = 1024 * 1024;   // 1MB buffer floor to resume sending


export const QR_EXPIRY_SECONDS = Number(import.meta.env.VITE_QR_EXPIRY_SECONDS) || 120;

// WebRTC ICE Server Configuration for ANYWHERE mode (STUN + TURN fallback)
export const ICE_SERVERS = (() => {
  const stunUrl = import.meta.env.VITE_STUN_URL || 'stun:stun.l.google.com:19302';
  const servers = [
    { urls: stunUrl },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ];

  const turnUrl = import.meta.env.VITE_TURN_URL;
  const turnUsername = import.meta.env.VITE_TURN_USERNAME;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;

  if (turnUrl) {
    const turnConfig = { urls: turnUrl };
    if (turnUsername) turnConfig.username = turnUsername;
    if (turnCredential) turnConfig.credential = turnCredential;
    servers.push(turnConfig);
  }

  return servers;
})();

// WebRTC ICE Server Configuration for NEARBY mode (STUN-only to force direct local LAN / host connection)
export const NEARBY_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];



export const TRANSFER_STATUSES = {
  IDLE: 'IDLE',
  CREATING: 'CREATING',
  WAITING: 'WAITING',
  NEGOTIATING: 'NEGOTIATING',
  CONNECTED: 'CONNECTED',
  TRANSFERRING: 'TRANSFERRING',
  COMPLETED: 'COMPLETED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
};

export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function getFileTypeCategory(file) {
  if (!file || !file.type) return 'other';
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  
  const documentTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument', 'text/plain'];
  if (documentTypes.some(type => file.type.includes(type))) return 'document';
  
  const archiveTypes = ['application/zip', 'application/x-rar', 'application/gzip', 'application/x-tar'];
  if (archiveTypes.some(type => file.type.includes(type))) return 'archive';

  return 'other';
}

export function getFileIcon(category) {
  switch (category) {
    case 'image': return '🖼️';
    case 'video': return '🎬';
    case 'audio': return '🎵';
    case 'document': return '📄';
    case 'archive': return '📦';
    default: return '📄';
  }
}
