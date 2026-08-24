import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useReceiver from '../hooks/useReceiver';
import ParallelBackground from '../components/ParallelBackground';
import GlassCard from '../components/GlassCard';
import TransferProgress from '../components/TransferProgress';

import ErrorState from '../components/ErrorState';
import { formatFileSize, getFileIcon, getFileTypeCategory } from '../config/constants';

// Detect iOS Safari / iOS Chrome
function isIOSDevice() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function FileDownloadItem({ file, onDownload }) {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onDownload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.04] border border-white/[0.08]">
      <div className="min-w-0 pr-3">
        <p className="text-xs font-medium text-[#F5F5F2] truncate">{file.name}</p>
        <p className="text-[10px] text-[#9CA3A2]">{formatFileSize(file.size)}</p>
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="px-3.5 py-1.5 rounded-lg bg-[#5BA5A5]/25 hover:bg-[#5BA5A5]/40 text-[#5BA5A5] hover:text-white text-xs font-semibold transition-all flex-shrink-0 flex items-center gap-1.5 border border-[#5BA5A5]/30 cursor-pointer disabled:opacity-60"
      >
        {busy ? (
          <>
            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Saving…
          </>
        ) : (
          'Download ↓'
        )}
      </button>
    </div>
  );
}

const initializedPortals = new Set();

export default function ReceiverPage({ token, keyString }) {

  const {
    status,
    files,
    progress,
    error,
    connect,
    acceptTransfer,
    getCompletedFileBlob,
    saveFileItem,
  } = useReceiver();

  // Called when the user taps Download for a specific file index
  const downloadFile = useCallback(async (idx) => {
    const item = getCompletedFileBlob(idx);
    if (!item) {
      console.warn('[ReceiverPage] No blob found for index', idx);
      return;
    }

    const ios = isIOSDevice();

    // iOS Safari/Chrome: <a download> was historically ignored but works in iOS 13+.
    // We use Web Share API for smaller files so the user gets the native Share Sheet (Save Image/Video).
    // However, sharing massive files (>50MB) via navigator.share causes an immediate Out Of Memory crash on iOS.
    const isMassiveFile = item.blob.size > 50 * 1024 * 1024; // > 50MB
    if (ios && navigator.share && navigator.canShare && !isMassiveFile) {
      try {
        const fallbackType = item.filename.toLowerCase().endsWith('.jpg') || item.filename.toLowerCase().endsWith('.jpeg') ? 'image/jpeg' 
                           : item.filename.toLowerCase().endsWith('.png') ? 'image/png'
                           : item.filename.toLowerCase().endsWith('.mp4') ? 'video/mp4'
                           : 'application/octet-stream';
                           
        const mimeType = item.mimeType || item.blob.type || fallbackType;
        const fileObj = item.file || new File([item.blob], item.filename, {
          type: mimeType,
          lastModified: Date.now(),
        });
        
        if (navigator.canShare({ files: [fileObj] })) {
          await navigator.share({ files: [fileObj] });
          return;
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn('[ReceiverPage] iOS share failed, falling back to blob URL:', err);
      }
    }

    // Android / Desktop: standard Blob URL download
    const url = URL.createObjectURL(item.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }, [getCompletedFileBlob]);

  useEffect(() => {
    console.log(`[DIAG_LIFECYCLE_RECEIVER] ReceiverPage MOUNTED. Token: ${token}`);
    const handleVisChange = () => console.log(`[DIAG_LIFECYCLE_RECEIVER] visibilitychange: ${document.visibilityState}`);
    const handlePageShow = (e) => console.log(`[DIAG_LIFECYCLE_RECEIVER] pageshow (persisted: ${e.persisted})`);
    const handlePageHide = (e) => console.log(`[DIAG_LIFECYCLE_RECEIVER] pagehide (persisted: ${e.persisted})`);
    const handleBeforeUnload = () => console.log(`[DIAG_LIFECYCLE_RECEIVER] beforeunload fired`);
    
    document.addEventListener('visibilitychange', handleVisChange);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      console.log(`[DIAG_LIFECYCLE_RECEIVER] ReceiverPage UNMOUNTED. Token: ${token}`);
      document.removeEventListener('visibilitychange', handleVisChange);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [token]);

  useEffect(() => {
    console.log(`[DIAG_LIFECYCLE_RECEIVER] Receiver status changed to: ${status}`);
    if (status === 'CONNECTING' || status === 'WAITING' || status === 'RECOVERING') {
      console.trace(`[DIAG_TRACE_RECEIVER] UI transitioned to ${status}`);
    }
  }, [status]);

  useEffect(() => {
    if (token && keyString && !initializedPortals.has(token)) {
      initializedPortals.add(token);
      console.log('[ReceiverPage] Initializing connection for portal', token);
      console.trace('[DIAG_TRACE_RECEIVER] connect called');
      connect(token, keyString);
    }
    
    return () => {
      // Delay removal to allow React StrictMode to remount without triggering a second connection
      setTimeout(() => {
        initializedPortals.delete(token);
      }, 1000);
    };
  }, [token, keyString, connect]);

  const totalSize = files.reduce((acc, f) => acc + (f.size || 0), 0);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#090A0A] text-[#F5F5F2] overflow-hidden relative">
      <ParallelBackground />
      
      <header className="absolute top-0 left-0 w-full p-4 sm:p-6 z-20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="9" cy="12" r="6" stroke="#D4A574" strokeWidth="2" strokeOpacity="0.8"/>
            <circle cx="15" cy="12" r="6" stroke="#5BA5A5" strokeWidth="2" strokeOpacity="0.8"/>
          </svg>
          <span className="text-sm font-semibold tracking-[0.25em] uppercase text-[#F5F5F2]">
            PARALLEL
          </span>
        </div>
      </header>

      <main className="flex-grow flex flex-col items-center justify-center relative z-10 px-4 sm:px-6 w-full pb-[env(safe-area-inset-bottom)]">
        <AnimatePresence mode="wait">
          
          {(status === 'LOADING' || status === 'CREATING' || status === 'NEGOTIATING') && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.4 }}
              className="w-full max-w-md mx-auto"
            >
              <style>{`
                @keyframes connectFlow {
                  0% { transform: translateX(-100%); opacity: 0; }
                  5% { opacity: 1; }
                  95% { opacity: 1; }
                  100% { transform: translateX(0%); opacity: 0; }
                }
              `}</style>
              <GlassCard className="flex flex-col p-8 rounded-[24px]">
                <div className="flex flex-col items-center justify-center text-center">
                  <h2 className="text-[15px] font-medium text-[#F3F4F6] tracking-wide mb-2">Connecting portal...</h2>
                  <p className="text-[13px] text-[#9CA3AF] mb-10">Establishing secure peer connection</p>
                  
                  <div className="w-full relative flex items-center justify-between px-2 mb-2">
                    {/* Source Node (Laptop) */}
                    <div className="w-10 h-10 rounded-full border border-white/[0.08] bg-white/[0.02] flex items-center justify-center z-10 shadow-[0_4px_15px_rgba(0,0,0,0.2)]">
                      <svg className="w-4 h-4 text-[#9CA3AF]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                        <line x1="8" y1="21" x2="16" y2="21"></line>
                        <line x1="12" y1="17" x2="12" y2="21"></line>
                      </svg>
                    </div>

                    {/* Path & Pulsing Packets */}
                    <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent via-[#5BA5A5]/40 to-transparent relative mx-4 overflow-visible">
                      <div className="absolute top-0 left-0 w-full h-full animate-[pulse_1.5s_ease-in-out_infinite] bg-[#5BA5A5]/20 shadow-[0_0_8px_rgba(91,165,165,0.4)]"></div>
                      <div className="absolute top-[-1.5px] left-0 w-full h-full" style={{ animation: 'connectFlow 2s linear infinite' }}>
                        <div className="absolute right-0 w-1.5 h-1.5 rounded-full bg-[#5BA5A5] shadow-[0_0_8px_rgba(91,165,165,0.8)]"></div>
                      </div>
                      <div className="absolute top-[-1.5px] left-0 w-full h-full" style={{ animation: 'connectFlow 2s linear infinite', animationDelay: '1s' }}>
                        <div className="absolute right-0 w-1.5 h-1.5 rounded-full bg-[#5BA5A5] shadow-[0_0_8px_rgba(91,165,165,0.8)]"></div>
                      </div>
                    </div>

                    {/* Dest Node (Phone) */}
                    <div className="w-10 h-10 rounded-full border border-white/[0.08] bg-white/[0.02] flex items-center justify-center z-10 shadow-[0_4px_15px_rgba(0,0,0,0.2)]">
                      <svg className="w-4 h-4 text-[#9CA3AF]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                        <line x1="12" y1="18" x2="12.01" y2="18"></line>
                      </svg>
                    </div>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          )}

          {(status === 'WAITING' || status === 'CONNECTED') && (
            <motion.div
              key="ready"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="w-full max-w-md mx-auto"
            >
              <GlassCard className="p-6 sm:p-8 flex flex-col h-full max-h-[80vh]">
                <div className="mb-6 text-center">
                  <h2 className="text-2xl font-light tracking-tight inline-flex items-center gap-2 text-[#F5F5F2]">
                    <span className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse shadow-[0_0_8px_rgba(91,165,165,0.6)]"></span>
                    Incoming Portal
                  </h2>
                  <p className="text-[#9CA3A2] mt-1 text-sm">
                    {files.length} {files.length === 1 ? 'file' : 'files'} &middot; {formatFileSize(totalSize)}
                  </p>
                </div>

                <div className="flex-grow overflow-y-auto min-h-0 mb-6 pr-2 space-y-3 custom-scrollbar">
                  {files.map((file, idx) => {
                    const category = getFileTypeCategory(file);
                    const iconEmoji = getFileIcon(category);
                    
                    return (
                      <div key={idx} className="flex items-center p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                        <div className="w-10 h-10 rounded-lg bg-white/[0.05] flex items-center justify-center mr-3 flex-shrink-0 text-lg">
                          {iconEmoji}
                        </div>
                        <div className="flex-grow min-w-0 mr-3">
                          <p className="text-sm font-medium truncate text-[#F5F5F2]">{file.name}</p>
                          <p className="text-xs text-[#9CA3A2]">{formatFileSize(file.size)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-auto pt-4 border-t border-white/[0.08]">
                  <button
                    onClick={acceptTransfer}
                    className="relative overflow-hidden w-full min-h-[52px] py-3.5 rounded-xl bg-gradient-to-r from-[#5BA5A5]/10 via-[#D4A574]/10 to-[#5BA5A5]/10 border border-[#5BA5A5]/20 backdrop-blur-md text-[#F3F4F6] font-medium text-[13px] uppercase tracking-widest hover:border-[#D4A574]/40 hover:bg-white/[0.05] hover:shadow-[0_0_20px_rgba(212,165,116,0.15)] active:scale-[0.98] transition-all duration-300 flex items-center justify-center group"
                  >
                    {/* Crystal inner reflection */}
                    <div className="absolute inset-0 bg-gradient-to-b from-white/[0.08] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-xl"></div>
                    
                    <span className="relative z-10 flex items-center justify-center gap-2.5">
                      <svg className="text-[#5BA5A5] group-hover:translate-y-[1px] transition-transform duration-300" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                      RECEIVE EVERYTHING
                    </span>
                  </button>
                </div>
              </GlassCard>
            </motion.div>
          )}

          {(status === 'TRANSFERRING' || status === 'RECOVERING') && (
            <motion.div
              key="transferring"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="w-full max-w-xl mx-auto"
            >
              <TransferProgress 
                progress={progress} 
                direction="receiving" 
                status={status}
              />
            </motion.div>
          )}

          {status === 'COMPLETED' && (
            <motion.div
              key="completed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-md mx-auto text-center"
            >
              <GlassCard className="p-10 flex flex-col items-center">
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", bounce: 0.5, delay: 0.2 }}
                  className="w-20 h-20 rounded-full bg-teal-500/10 flex items-center justify-center mb-6"
                >
                  <svg className="w-10 h-10 text-[#5BA5A5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </motion.div>
                <h2 className="text-3xl font-light mb-2 text-[#F5F5F2]">Transfer Complete</h2>
                <p className="text-[#9CA3A2] text-sm mb-4">{files.length} {files.length === 1 ? 'file' : 'files'} received &amp; verified.</p>
                
                <div className="w-full max-h-56 overflow-y-auto space-y-2.5 mb-6 text-left">
                  {files.map((file, idx) => (
                    <FileDownloadItem
                      key={idx}
                      file={file}
                      onDownload={() => downloadFile(idx)}
                    />
                  ))}
                </div>

                <button 
                  onClick={() => window.location.href = '/'}
                  className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 text-[#F5F5F2] font-medium text-sm transition-colors"
                >
                  Done
                </button>

              </GlassCard>
            </motion.div>
          )}


          {status === 'NOT_FOUND' && (
            <motion.div key="not_found" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-md mx-auto">
              <ErrorState 
                type="expired"
                message="Portal Not Found"
                description={error || "This portal does not exist. Check the URL or scan a new QR code."}
              />
            </motion.div>
          )}


          {status === 'EXPIRED' && (
            <motion.div key="expired" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-md mx-auto">
              <ErrorState 
                type="expired"
                message="Portal Expired"
                description="The 2-minute connection window has closed."
              />
            </motion.div>
          )}

          {status === 'CANCELLED' && (
            <motion.div key="cancelled" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-md mx-auto">
              <ErrorState 
                type="expired"
                message="Portal Closed"
                description="The sender closed this portal."
              />
            </motion.div>
          )}

          {status === 'ALREADY_CONNECTED' && (
            <motion.div key="already_connected" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-md mx-auto">
              <ErrorState 
                type="already_connected"
                message="Portal Already Connected"
                description="Another device is already connected to this transfer."
              />
            </motion.div>
          )}

          {(status === 'ERROR' || status === 'FAILED') && (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-md mx-auto">
              <ErrorState 
                type="generic"
                message="Couldn't Connect"
                description={error || "Could not establish device-to-device connection."}
              />
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}
