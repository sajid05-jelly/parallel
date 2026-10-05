
export const MAX_FILES_PER_TRANSFER = Number(import.meta.env.VITE_MAX_FILES_PER_TRANSFER) || 50;

// WebRTC DataChannel chunking configuration
// 64KB chunks can cause massive fragmentation drops on WAN. 16KB-32KB is much safer for SCTP over UDP.
export const WEBRTC_CHUNK_SIZE = 16384; // STRICTLY 16KB TO PREVENT UDP FRAGMENTATION DROPS ON HOTSPOTS // 32KB

// To prevent bufferbloat and SCTP congestion collapse, do not buffer 4MB in the OS.
// Keep the high water mark around 512KB for a healthy pipeline.
export const HIGH_WATER_MARK = 256 * 1024;
export const LOW_WATER_MARK = 64 * 1024;




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
    // Split by comma in case multiple TURN URLs are provided (e.g. UDP, TCP, TLS)
    const rawUrls = turnUrl.split(',').map(u => u.trim()).filter(Boolean);
    
    // Sort to ensure UDP is tried before TCP/TLS to avoid artificial WAN bottlenecks
    const sortedUrls = rawUrls.sort((a, b) => {
      const aIsUdp = !a.includes('transport=tcp') && !a.startsWith('turns:');
      const bIsUdp = !b.includes('transport=tcp') && !b.startsWith('turns:');
      if (aIsUdp && !bIsUdp) return -1;
      if (!aIsUdp && bIsUdp) return 1;
      return 0;
    });

    const turnConfig = { urls: sortedUrls.length === 1 ? sortedUrls[0] : sortedUrls };
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


