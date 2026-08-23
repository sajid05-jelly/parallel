import { useState, useCallback, useRef } from 'react';
import { WebRTCReceiverTransport } from '../lib/WebRTCReceiverTransport';

export default function useReceiver() {
  const [status, setStatus] = useState('LOADING');
  const [session, setSession] = useState(null);
  const [files, setFiles] = useState([]);
  const [progress, setProgress] = useState({
    totalBytes: 0,
    receivedBytes: 0,
    percentage: 0,
    currentFile: null,
    totalFiles: 0,
    filesReceived: 0,
    speed: 0,
    eta: 0
  });
  const [error, setError] = useState(null);

  const transportRef = useRef(null);

  const connect = useCallback(async (token, keyString) => {
    try {
      setStatus('LOADING');
      setError(null);

      const transport = new WebRTCReceiverTransport({
        onProgress: (prog) => setProgress(prog),
        onStatusChange: (newStatus) => {
          console.log('[useReceiver] Status update:', newStatus);
          setStatus(newStatus);
          if (newStatus === 'WAITING' && transportRef.current?.manifest) {
            setFiles(transportRef.current.manifest.files || []);
          }
        },
        onError: (err) => {
          setStatus('ERROR');
          setError(err.message || 'Transfer failed');
        },
        onComplete: () => setStatus('COMPLETED')
      });

      transportRef.current = transport;

      const result = await transport.connect(token, keyString);
      setSession(result.session);

    } catch (err) {
      console.error('[useReceiver] Receiver connection error:', err);
      const msg = err?.message || '';

      if (msg.includes('EXPIRED')) {
        setStatus('EXPIRED');
        setError('The 2-minute portal connection window has closed.');
      } else if (msg.includes('ALREADY_CONNECTED')) {
        setStatus('ALREADY_CONNECTED');
        setError('This portal is already connected to another device.');
      } else if (msg.includes('CANCELLED')) {
        setStatus('CANCELLED');
        setError('The sender has closed this portal.');
      } else if (msg === 'NOT_FOUND') {
        setStatus('NOT_FOUND');
        setError('This portal does not exist.');
      } else {
        setStatus('ERROR');
        setError(msg || 'Could not establish connection. Check your internet connection.');
      }
    }

  }, []);

  const acceptTransfer = useCallback(() => {
    if (!transportRef.current) return;
    try {
      transportRef.current.acceptTransfer();
    } catch (err) {
      console.error('Accept transfer error:', err);
      setStatus('ERROR');
      setError('Failed to accept transfer');
    }
  }, []);

  const cancel = useCallback(() => {
    if (transportRef.current) {
      transportRef.current.cancel();
    }
    setStatus('CANCELLED');
  }, []);

  const saveFileItem = useCallback(async (index) => {
    if (transportRef.current && transportRef.current.completedFiles?.[index]) {
      return await transportRef.current.saveFileItem(transportRef.current.completedFiles[index]);
    }
  }, []);

  const getCompletedFileBlob = useCallback((index) => {
    const filesMeta = transportRef.current?.manifest?.files;
    const completed = transportRef.current?.completedFiles;
    if (!completed || !filesMeta) return null;
    // Match by filename since assembly order may differ from manifest order
    const filename = filesMeta[index]?.name;
    if (!filename) return null;
    return completed.find(f => f.filename === filename) || null;
  }, []);

  const saveAllItems = useCallback(async () => {
    if (transportRef.current) {
      return await transportRef.current.saveAllItems();
    }
  }, []);

  return {
    status,
    session,
    files,
    progress,
    error,
    connect,
    acceptTransfer,
    cancel,
    saveFileItem,
    saveAllItems,
    getCompletedFileBlob
  };
}


