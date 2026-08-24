import { useState, useCallback, useRef, useEffect } from 'react';
import { WebRTCTransport } from '../lib/WebRTCTransport';
import { getSessionByToken } from '../lib/sessionManager';
import {
  TRANSFER_STATUSES,
  MAX_FILE_SIZE,
  MAX_FILES_PER_TRANSFER,
  MAX_TRANSFER_SIZE,
  formatFileSize,
  getFileTypeCategory,
} from '../config/constants';

function fileKey(file) {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

export function useTransfer() {
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState('IDLE');
  const [mode, setMode] = useState(null); // null (unselected), 'nearby', or 'anywhere'
  const [progress, setProgress] = useState({
    totalBytes: 0,
    sentBytes: 0,
    percentage: 0,
    currentFile: null,
    totalFiles: 0,
    filesSent: 0,
    speed: 0,
    eta: 0,
  });
  const [transferUrl, setTransferUrl] = useState(null);
  const [token, setToken] = useState(null);
  const [error, setError] = useState(null);
  const [qrExpiry, setQrExpiry] = useState(null);
  const wakeLockRef = useRef(null);

  // Automatically request WakeLock when transferring to prevent mobile screen sleep from killing WebRTC
  useEffect(() => {
    let active = true;
    const manageWakeLock = async () => {
      if (status === 'TRANSFERRING' && 'wakeLock' in navigator) {
        try {
          if (!wakeLockRef.current) {
            wakeLockRef.current = await navigator.wakeLock.request('screen');
            console.log('[useTransfer] Screen Wake Lock acquired.');
          }
        } catch (err) {
          console.warn('[useTransfer] Wake Lock failed:', err);
        }
      } else if ((status === 'COMPLETED' || status === 'FAILED' || status === 'IDLE' || status === 'CANCELLED') && wakeLockRef.current) {
        wakeLockRef.current.release().then(() => {
          if (active) {
            console.log('[useTransfer] Screen Wake Lock released.');
            wakeLockRef.current = null;
          }
        }).catch(() => {});
      }
    };
    
    manageWakeLock();
    
    return () => {
      active = false;
    };
  }, [status]);

  const transportRef = useRef(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      files.forEach((f) => {
        if (f.preview) URL.revokeObjectURL(f.preview);
      });
    };
  }, []);

  // Poll session status while WAITING (check for expiry or connected state)
  useEffect(() => {
    let interval;
    if (status === 'WAITING' && token) {
      interval = setInterval(async () => {
        try {
          const { session } = await getSessionByToken(token);
          if (!session) {
            setStatus('EXPIRED');
            clearInterval(interval);
            return;
          }

          if (session.receiver_connected && status === 'WAITING') {
            setStatus('CONNECTED');
            clearInterval(interval);
          } else if (new Date(session.expires_at) < new Date() && !session.receiver_connected) {
            setStatus('EXPIRED');
            clearInterval(interval);
          }
        } catch (err) {
          console.error('Polling error:', err);
        }
      }, 3000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status, token]);

  const addFiles = useCallback((fileList) => {
    const incoming = Array.from(fileList);
    const errors = [];
    const addedNames = [];

    setFiles((prev) => {
      const existingKeys = new Set(prev.map((f) => f._key));

      let currentCount = prev.length;
      let currentSize = prev.reduce((sum, f) => sum + f.size, 0);
      const toAdd = [];

      for (const file of incoming) {
        const key = fileKey(file);

        if (existingKeys.has(key)) {
          errors.push(`"${file.name}" is already selected.`);
          continue;
        }

        if (currentCount >= MAX_FILES_PER_TRANSFER) {
          errors.push(`Maximum ${MAX_FILES_PER_TRANSFER} files allowed.`);
          break;
        }



        let preview = null;
        if (file.type && file.type.startsWith('image/')) {
          preview = URL.createObjectURL(file);
        }

        const category = getFileTypeCategory(file);

        const fileData = {
          id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
          _key: key,
          file,
          name: file.name,
          size: file.size,
          type: file.type || '',
          category,
          preview,
        };

        toAdd.push(fileData);
        existingKeys.add(key);
        addedNames.push(file.name);
        currentCount += 1;
        currentSize += file.size;
      }

      if (toAdd.length === 0) return prev;
      return [...prev, ...toAdd];
    });

    return { added: addedNames, errors };
  }, []);

  const removeFile = useCallback((fileId) => {
    setFiles((prev) => {
      const fileToRemove = prev.find((f) => f.id === fileId);
      if (fileToRemove && fileToRemove.preview) {
        URL.revokeObjectURL(fileToRemove.preview);
      }
      return prev.filter((f) => f.id !== fileId);
    });
  }, []);

  const clearFiles = useCallback(() => {
    setFiles((prev) => {
      prev.forEach((f) => {
        if (f.preview) URL.revokeObjectURL(f.preview);
      });
      return [];
    });
  }, []);

  const createPortal = useCallback(async () => {
    console.trace('[DIAG_TRACE_SENDER] createPortal called');
    setFiles((currentFiles) => {
      if (currentFiles.length === 0) return currentFiles;
      _doCreatePortal(currentFiles);
      return currentFiles;
    });
  }, []);

  const isCreatingRef = useRef(false);
  const isCancelledRef = useRef(false);

  async function _doCreatePortal(currentFiles) {
    if (isCreatingRef.current || (transportRef.current && transportRef.current.status !== 'FAILED' && transportRef.current.status !== 'CANCELLED')) {
      console.log('[useTransfer] Ignoring duplicate portal creation request.');
      return;
    }
    
    isCreatingRef.current = true;
    isCancelledRef.current = false;
    try {
      setStatus('CREATING');
      setError(null);

      const transport = new WebRTCTransport({
        onProgress: (prog) => setProgress(prog),
        onStatusChange: (newStatus) => {
          if (isCancelledRef.current) return;
          setStatus(newStatus);
        },
        onError: (err) => {
          if (isCancelledRef.current) return;
          console.error('[useTransfer] Transport error:', err);
          setError(err?.message || 'The connection between the devices was interrupted.');
          setStatus('FAILED');
        },

        onComplete: () => {
          if (isCancelledRef.current) return;
          setStatus('COMPLETED');
        }
      });

      transportRef.current = transport;

      const rawFiles = currentFiles.map((f) => f.file);
      transport.setFiles(rawFiles);

      const result = await transport.createPortal();

      if (isCancelledRef.current) return;

      if (result && result.url) {
        setTransferUrl(result.url);
        setToken(result.token);
        setQrExpiry(result.expiresAt);
        setStatus('WAITING');
      }
    } catch (err) {
      if (isCancelledRef.current) return;
      console.error('[PARALLEL] Portal creation error:', err);
      const detail = err?.message || 'We couldn\'t create the temporary connection.';
      setError(`Couldn't open portal. ${detail}`);
      setStatus('FAILED');
    } finally {
      isCreatingRef.current = false;
    }
  }

  const cancelTransfer = useCallback(() => {
    isCancelledRef.current = true;
    if (transportRef.current) {
      transportRef.current.cancelPortal();
    }
    transportRef.current = null;
    setStatus('IDLE');
    setProgress({
      totalBytes: 0,
      sentBytes: 0,
      percentage: 0,
      currentFile: null,
      totalFiles: 0,
      filesSent: 0,
      speed: 0,
      eta: 0,
    });
    setTransferUrl(null);
    setToken(null);
    setError(null);
    setQrExpiry(null);
    setMode(null);
  }, []);

  const reset = useCallback(() => {
    if (transportRef.current) {
      transportRef.current.cancelPortal();
    }
    transportRef.current = null;
    clearFiles();
    setStatus('IDLE');
    setProgress({
      totalBytes: 0,
      sentBytes: 0,
      percentage: 0,
      currentFile: null,
      totalFiles: 0,
      filesSent: 0,
      speed: 0,
      eta: 0,
    });
    setTransferUrl(null);
    setToken(null);
    setError(null);
    setQrExpiry(null);
    setMode(null);
  }, [clearFiles]);

  const retry = useCallback(() => {
    if (transportRef.current) {
      transportRef.current.cancelPortal();
    }
    transportRef.current = null;
    setStatus('IDLE'); // This allows SenderPage to show the mode selection or start over without losing files
    setProgress({
      totalBytes: 0,
      sentBytes: 0,
      percentage: 0,
      currentFile: null,
      totalFiles: 0,
      filesSent: 0,
      speed: 0,
      eta: 0,
    });
    setTransferUrl(null);
    setToken(null);
    setError(null);
    setQrExpiry(null);
  }, []);

  return {
    files,
    status,
    mode,
    setMode,
    progress,
    transferUrl,
    token,
    error,
    qrExpiry,
    addFiles,
    removeFile,
    clearFiles,
    createPortal,
    cancelTransfer,
    reset,
    retry,
  };
}


export default useTransfer;
