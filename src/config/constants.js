export const MAX_FILE_SIZE = Number(import.meta.env.VITE_MAX_FILE_SIZE) || 10737418240; // 10GB
export const MAX_TRANSFER_SIZE = Number(import.meta.env.VITE_MAX_TRANSFER_SIZE) || 10737418240; // 10GB  
export const MAX_FILES_PER_TRANSFER = Number(import.meta.env.VITE_MAX_FILES_PER_TRANSFER) || 50;

// WebRTC DataChannel chunking configuration (Safe 64KB chunk slice & 1MB buffer window to prevent queue overflow)
export const WEBRTC_CHUNK_SIZE = Number(import.meta.env.VITE_WEBRTC_CHUNK_SIZE) || 65536; // 64KB safe dynamic default
export const HIGH_WATER_MARK = 1024 * 1024; // 1MB high-water mark (prevents browser SCTP send queue buffer overflow)
export const LOW_WATER_MARK = 256 * 1024;   // 256KB low-water mark floor to resume sending




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
  if (!file) return 'other';

  // 1. Check MIME type first
  if (file.type) {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('audio/')) return 'audio';
    
    const documentTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument', 'text/plain'];
    if (documentTypes.some(type => file.type.includes(type))) return 'document';
    
    const archiveTypes = ['application/zip', 'application/x-rar', 'application/gzip', 'application/x-tar'];
    if (archiveTypes.some(type => file.type.includes(type))) return 'archive';
  }

  // 2. Fallback to extension if MIME type is missing or unhelpful
  if (file.name) {
    const ext = file.name.split('.').pop().toLowerCase();
    const videoExts = ['mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv', 'flv', 'wmv'];
    if (videoExts.includes(ext)) return 'video';
    
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'svg'];
    if (imageExts.includes(ext)) return 'image';
    
    const audioExts = ['mp3', 'wav', 'ogg', 'm4a', 'aac'];
    if (audioExts.includes(ext)) return 'audio';
    
    const docExts = ['pdf', 'doc', 'docx', 'txt', 'rtf'];
    if (docExts.includes(ext)) return 'document';
  }

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
