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

  const transportRef = useRef(null);

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

        if (file.size > MAX_FILE_SIZE) {
          errors.push(`"${file.name}" exceeds the ${formatFileSize(MAX_FILE_SIZE)} limit.`);
          continue;
        }

        if (currentSize + file.size > MAX_TRANSFER_SIZE) {
          errors.push(`Adding "${file.name}" would exceed the ${formatFileSize(MAX_TRANSFER_SIZE)} total limit.`);
          continue;
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
    setFiles((currentFiles) => {
      if (currentFiles.length === 0) return currentFiles;
      _doCreatePortal(currentFiles);
      return currentFiles;
    });
  }, []);

  async function _doCreatePortal(currentFiles) {
    try {
      setStatus('CREATING');
      setError(null);

      const transport = new WebRTCTransport({
        onProgress: (prog) => setProgress(prog),
        onStatusChange: (newStatus) => setStatus(newStatus),
        onError: (err) => {
          console.error('[useTransfer] Transport error:', err);
          setError('Transfer couldn\'t be completed. Connection interrupted.');
          setStatus('FAILED');
        },
        onComplete: () => {
          setStatus('COMPLETED');
        }
      });

      transportRef.current = transport;

      const rawFiles = currentFiles.map((f) => f.file);
      transport.setFiles(rawFiles);

      const result = await transport.createPortal();

      if (result && result.url) {
        setTransferUrl(result.url);
        setToken(result.token);
        setQrExpiry(result.expiresAt);
        setStatus('WAITING');
      }
    } catch (err) {
      console.error('Portal creation error:', err);
      setError('Couldn\'t open portal. We couldn\'t create a temporary session.');
      setStatus('FAILED');
    }
  }

  const cancelTransfer = useCallback(() => {
    if (transportRef.current) {
      transportRef.current.cancelPortal();
    }
    setStatus('CANCELLED');
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
  }, [clearFiles]);

  return {
    files,
    status,
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
  };
}

export default useTransfer;
