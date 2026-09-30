import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTransfer } from '../hooks/useTransfer';

import Navbar from '../components/Navbar';
import UploadPortal from '../components/UploadPortal';
import FileList from '../components/FileList';
import QRScreen from '../components/QRScreen';
import TransferProgress from '../components/TransferProgress';
import ErrorState from '../components/ErrorState';
import { formatFileSize } from '../config/constants';


export default function SenderPage() {
  const [showModeSelection, setShowModeSelection] = useState(false);
  const {
    status,
    files,
    progress,
    error,
    createPortal,
    cancelTransfer,
    removeFile,
    reset,
    retry,
    transferUrl,
    qrExpiry,
    addFiles,
    mode,
    setMode,
    pattern,
  } = useTransfer();

  useEffect(() => {
    console.log(`[DIAG_LIFECYCLE_SENDER] SenderPage MOUNTED. Mode: ${mode}`);
    const handleVisChange = () => console.log(`[DIAG_LIFECYCLE_SENDER] visibilitychange: ${document.visibilityState}`);
    const handlePageShow = (e) => console.log(`[DIAG_LIFECYCLE_SENDER] pageshow (persisted: ${e.persisted})`);
    const handlePageHide = (e) => console.log(`[DIAG_LIFECYCLE_SENDER] pagehide (persisted: ${e.persisted})`);
    const handleBeforeUnload = () => console.log(`[DIAG_LIFECYCLE_SENDER] beforeunload fired`);
    
    document.addEventListener('visibilitychange', handleVisChange);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      console.log(`[DIAG_LIFECYCLE_SENDER] SenderPage UNMOUNTED. Mode: ${mode}`);
      document.removeEventListener('visibilitychange', handleVisChange);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [mode]);

  useEffect(() => {
    console.log(`[DIAG_LIFECYCLE_SENDER] Sender status changed to: ${status}`);
    if (status === 'WAITING' || status === 'CREATING' || status === 'NEGOTIATING') {
      console.trace(`[DIAG_TRACE_SENDER] UI transitioned to QR/Portal screen (status=${status})`);
    }
  }, [status]);

  const handleFilesSelected = (fileList) => {
    addFiles(fileList);
  };

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);

  const renderContent = () => {
    if (status === 'IDLE' || status === 'UPLOADING') {
      // Step 1: Mode Selection (Nearby ⚡ vs Anywhere 🌐)
      // Step 1: Home / Mode Selection
      if (!mode) {
        if (!showModeSelection) {
          return (
            <motion.div
              key="home-selection"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-3xl mx-auto text-center"
            >
              <div className="mb-12">
                <span className="text-[11px] font-medium tracking-widest text-[#9CA3AF] uppercase mb-4 inline-block">
                  Direct P2P File Transfer
                </span>
                <h1 className="text-4xl md:text-[44px] font-semibold text-[#F3F4F6] leading-tight tracking-tight mb-4">
                  Welcome to PARALLEL
                </h1>
                <p className="text-[15px] text-[#6B7280] max-w-md mx-auto leading-relaxed">
                  Fast, secure, and unlimited file sharing across any device.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-5 max-w-2xl mx-auto mb-8">
                {/* SEND FILES */}
                <motion.button
                  whileHover={{ y: -4 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                  onClick={() => setShowModeSelection(true)}
                  className="flex-1 group p-8 rounded-[24px] bg-[#0F1115] border border-white/[0.08] hover:border-[#5BA5A5]/40 shadow-[0_8px_32px_rgba(0,0,0,0.3)] transition-colors duration-500 text-center flex flex-col items-center justify-center relative overflow-hidden min-h-[220px]"
                >
                  {/* Subtle animated background glow */}
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,_rgba(91,165,165,0.15)_0%,_transparent_70%)] opacity-0 group-hover:opacity-100 transition-opacity duration-700 motion-reduce:transition-none pointer-events-none"></div>
                  
                  {/* Animated top border highlight */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-[1px] bg-gradient-to-r from-transparent via-[#5BA5A5] to-transparent group-hover:w-3/4 transition-all duration-700 ease-[0.23,1,0.32,1] opacity-0 group-hover:opacity-100 motion-reduce:transition-none"></div>

                  <div className="w-16 h-16 rounded-[18px] bg-white/[0.02] group-hover:bg-[#5BA5A5]/10 flex items-center justify-center border border-white/[0.05] group-hover:border-[#5BA5A5]/30 group-hover:shadow-[0_0_20px_rgba(91,165,165,0.2)] mb-6 transition-all duration-500 ease-out relative z-10 motion-reduce:transition-none">
                    <svg 
                      className="w-7 h-7 text-[#5BA5A5] transition-transform duration-500 ease-[0.23,1,0.32,1] group-hover:-translate-y-1 group-hover:translate-x-1 motion-reduce:transform-none" 
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                    >
                      <line x1="7" y1="17" x2="17" y2="7"></line>
                      <polyline points="7 7 17 7 17 17"></polyline>
                    </svg>
                  </div>
                  
                  <h3 className="text-xl font-semibold text-[#F3F4F6] mb-2 group-hover:text-white transition-colors tracking-wide relative z-10">
                    SEND FILES
                  </h3>
                  <p className="text-[14px] text-[#8B9392] group-hover:text-[#9CA3A2] transition-colors relative z-10">
                    Send files to another device
                  </p>
                </motion.button>

                {/* RECEIVE FILES */}
                <motion.button
                  whileHover={{ y: -4 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                  onClick={() => { window.location.href = '/receive'; }}
                  className="flex-1 group p-8 rounded-[24px] bg-[#0F1115] border border-white/[0.08] hover:border-[#D4A574]/40 shadow-[0_8px_32px_rgba(0,0,0,0.3)] transition-colors duration-500 text-center flex flex-col items-center justify-center relative overflow-hidden min-h-[220px]"
                >
                  {/* Subtle animated background glow */}
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,_rgba(212,165,116,0.15)_0%,_transparent_70%)] opacity-0 group-hover:opacity-100 transition-opacity duration-700 motion-reduce:transition-none pointer-events-none"></div>
                  
                  {/* Animated top border highlight */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-[1px] bg-gradient-to-r from-transparent via-[#D4A574] to-transparent group-hover:w-3/4 transition-all duration-700 ease-[0.23,1,0.32,1] opacity-0 group-hover:opacity-100 motion-reduce:transition-none"></div>

                  <div className="w-16 h-16 rounded-[18px] bg-white/[0.02] group-hover:bg-[#D4A574]/10 flex items-center justify-center border border-white/[0.05] group-hover:border-[#D4A574]/30 group-hover:shadow-[0_0_20px_rgba(212,165,116,0.2)] mb-6 transition-all duration-500 ease-out relative z-10 motion-reduce:transition-none">
                    <svg 
                      className="w-7 h-7 text-[#D4A574] transition-transform duration-500 ease-[0.23,1,0.32,1] group-hover:translate-y-1 group-hover:-translate-x-1 motion-reduce:transform-none" 
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                    >
                      <line x1="17" y1="7" x2="7" y2="17"></line>
                      <polyline points="17 17 7 17 7 7"></polyline>
                    </svg>
                  </div>
                  
                  <h3 className="text-xl font-semibold text-[#F3F4F6] mb-2 group-hover:text-white transition-colors tracking-wide relative z-10">
                    RECEIVE FILES
                  </h3>
                  <p className="text-[14px] text-[#8B9392] group-hover:text-[#9CA3A2] transition-colors relative z-10">
                    Receive files from another device
                  </p>
                </motion.button>
              </div>
            </motion.div>
          );
        }

        // The "Send Files" mode selection screen
        return (
          <motion.div
            key="mode-selection"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-2xl mx-auto text-center relative"
          >
            <button
              onClick={() => setShowModeSelection(false)}
              className="absolute -top-12 left-0 text-[13px] text-[#9CA3AF] hover:text-[#F3F4F6] flex items-center gap-2 transition-colors bg-white/[0.04] rounded-lg px-3 py-1.5 hover:bg-white/[0.08]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              Back
            </button>

            <div className="mb-12 mt-4">
              <span className="text-[11px] font-medium tracking-widest text-[#9CA3AF] uppercase mb-4 inline-block">
                Select Network Route
              </span>
              <h1 className="text-4xl md:text-[44px] font-semibold text-[#F3F4F6] leading-tight tracking-tight mb-4">
                Choose how to send
              </h1>
              <p className="text-[15px] text-[#6B7280] max-w-md mx-auto leading-relaxed">
                Pick the best route for your transfer
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left mb-8">
              {/* MODE 1 — NEARBY ⚡ */}
              <button
                onClick={() => setMode('nearby')}
                className="group p-7 rounded-[24px] bg-gradient-to-b from-white/[0.04] to-white/[0.01] hover:from-white/[0.06] hover:to-white/[0.02] backdrop-blur-xl border border-white/[0.08] hover:border-white/[0.15] shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-300 text-left flex flex-col relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-b from-[#D4A574]/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-[24px]"></div>
                <div className="flex items-center justify-between mb-5 relative z-10">
                  <div className="w-11 h-11 rounded-full bg-[#D4A574]/15 flex items-center justify-center border border-[#D4A574]/30 shadow-[0_0_15px_rgba(212,165,116,0.15)]">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4A574" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                  </div>
                  <span className="text-[10px] font-medium tracking-wider px-2.5 py-1 rounded-full bg-[#D4A574]/10 border border-[#D4A574]/20 text-[#D4A574] uppercase">
                    Max Speed
                  </span>
                </div>
                <h3 className="text-lg font-medium text-[#F3F4F6] mb-2 group-hover:text-white transition-colors relative z-10">
                  Nearby Transfer
                </h3>
                <p className="text-[13.5px] text-[#9CA3AF] leading-relaxed mb-5 flex-grow relative z-10">
                  Connect both devices to the same Wi-Fi for instant local network transfer.
                </p>
                <div className="pt-4 border-t border-white/[0.08] flex items-center justify-between text-[12px] text-[#6B7280] relative z-10">
                  <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-[#D4A574]/80"></div>Same Wi-Fi</span>
                  <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-[#D4A574]/80"></div>P2P Direct</span>
                </div>
              </button>

              {/* MODE 2 — ANYWHERE 🌐 */}
              <button
                onClick={() => setMode('anywhere')}
                className="group p-7 rounded-[24px] bg-gradient-to-b from-white/[0.04] to-white/[0.01] hover:from-white/[0.06] hover:to-white/[0.02] backdrop-blur-xl border border-white/[0.08] hover:border-white/[0.15] shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-300 text-left flex flex-col relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-b from-[#5BA5A5]/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-[24px]"></div>
                <div className="flex items-center justify-between mb-5 relative z-10">
                  <div className="w-11 h-11 rounded-full bg-[#5BA5A5]/15 flex items-center justify-center border border-[#5BA5A5]/30 shadow-[0_0_15px_rgba(91,165,165,0.15)]">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5BA5A5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                  </div>
                  <span className="text-[10px] font-medium tracking-wider px-2.5 py-1 rounded-full bg-[#5BA5A5]/10 border border-[#5BA5A5]/20 text-[#5BA5A5] uppercase">
                    Universal
                  </span>
                </div>
                <h3 className="text-lg font-medium text-[#F3F4F6] mb-2 group-hover:text-white transition-colors relative z-10">
                  Anywhere Transfer
                </h3>
                <p className="text-[13.5px] text-[#9CA3AF] leading-relaxed mb-5 flex-grow relative z-10">
                  Send securely across different networks, mobile data, or anywhere in the world.
                </p>
                <div className="pt-4 border-t border-white/[0.08] flex items-center justify-between text-[12px] text-[#6B7280] relative z-10">
                  <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-[#5BA5A5]/80"></div>Any Network</span>
                  <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-[#5BA5A5]/80"></div>Encrypted</span>
                </div>
              </button>
            </div>
            
            <p className="text-[12px] text-[#5C6462] tracking-wide mt-4">
              End-to-end encrypted &middot; No cloud storage &middot; Unlimited size
            </p>
          </motion.div>
        );
      }

      // Step 2: File selection flow
      if (files.length === 0) {
        return (
          <motion.div 
            key="upload-portal"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="w-full"
          >
            <div className="max-w-xl mx-auto mb-8 relative">
              <button
                onClick={() => setMode(null)}
                className="absolute -top-12 left-0 text-[13px] text-[#9CA3AF] hover:text-[#F3F4F6] flex items-center gap-2 transition-colors bg-white/[0.04] rounded-lg px-3 py-1.5 hover:bg-white/[0.08]"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                Back to Modes
              </button>
              
              <h1 className="text-3xl md:text-[36px] font-semibold text-[#F3F4F6] leading-tight tracking-tight mb-2">
                Select your files
              </h1>
              <p className="text-[14.5px] text-[#9CA3AF] leading-relaxed">
                {mode === 'nearby' 
                  ? 'Using Local Network Transfer. Files will be sent over your current Wi-Fi.'
                  : 'Using Anywhere Transfer. Files are end-to-end encrypted across networks.'
                }
              </p>
            </div>

            <div className="max-w-xl mx-auto">
              <UploadPortal onFilesSelected={handleFilesSelected} disabled={status === 'UPLOADING'} />
              
              <div className="flex items-center justify-center gap-8 text-[12px] text-[#6B7280] mt-6">
                <span className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                  End-to-end encrypted
                </span>
                <span className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                  2-minute expiry
                </span>
              </div>
            </div>
          </motion.div>
        );
      }
 else {
        return (
          <motion.div
            key="file-list"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-xl mx-auto p-6 rounded-[24px] bg-gradient-to-b from-white/[0.04] to-white/[0.01] backdrop-blur-2xl border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)] relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none rounded-[24px]"></div>
            <FileList 
              files={files} 
              onRemoveFile={removeFile} 
              onAddMore={handleFilesSelected}
              onCreatePortal={createPortal} 
              totalSize={totalSize} 
              isUploading={status === 'UPLOADING'} 
            />
          </motion.div>
        );
      }
    }

    if (status === 'WAITING' || status === 'CONNECTED' || status === 'CREATING' || status === 'NEGOTIATING') {
      return (
        <motion.div
          key="waiting"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <QRScreen 
            transferUrl={transferUrl} 
            fileCount={files.length} 
            totalSize={totalSize} 
            expiryDate={qrExpiry} 
            onCancel={cancelTransfer}
            status={status}
            mode={mode}
            pattern={pattern}
          />
        </motion.div>
      );
    }

    if (status === 'TRANSFERRING' || status === 'RECOVERING') {
      return (
        <motion.div
          key="transferring"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <TransferProgress progress={progress} direction="sending" status={status} />
        </motion.div>
      );
    }


    if (status === 'COMPLETED') {
      return (
        <motion.div
          key="completed"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          className="text-center p-8 max-w-md mx-auto bg-gradient-to-b from-white/[0.04] to-white/[0.01] border border-white/[0.08] backdrop-blur-2xl rounded-[24px] shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)] relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-[#5BA5A5]/[0.05] to-transparent opacity-100 pointer-events-none rounded-[24px]"></div>
          
          <div className="relative w-20 h-20 mx-auto mb-6 z-10">
            <div className="absolute inset-0 rounded-full border-2 border-[#5BA5A5]/30 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]"></div>
            <div className="w-full h-full bg-[#5BA5A5]/10 text-[#5BA5A5] rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(91,165,165,0.2)] border border-[#5BA5A5]/20">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
          </div>
          
          <h2 className="text-2xl font-semibold text-[#F3F4F6] mb-2 tracking-tight relative z-10">Transfer complete</h2>
          <p className="text-[14px] text-[#9CA3AF] mb-8 leading-relaxed relative z-10">
            Your files have been securely transferred and saved on the receiver device.<br />
            <span className="text-[#6B7280] text-[13px] mt-2 block">{files.length} {files.length === 1 ? 'file' : 'files'} &middot; {formatFileSize(totalSize)}</span>
          </p>
          <button onClick={reset} className="w-full py-3 bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.1] hover:border-white/[0.15] text-[#F5F5F2] font-medium rounded-xl transition-all duration-200 active:scale-[0.98] relative z-10">
            Send More Files
          </button>
        </motion.div>
      );
    }

    if (status === 'EXPIRED' || status === 'CANCELLED' || status === 'FAILED') {
      const errorType = status === 'EXPIRED' ? 'expired' : 'generic';
      return (
        <motion.div
          key="error"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <ErrorState type={errorType} message={error} onAction={retry} actionLabel="Try Again" />
        </motion.div>
      );
    }


    return null;
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      
      <Navbar />
      
      <main className="flex-grow flex items-center justify-center px-4 pt-24 pb-12 z-10 relative">
        <AnimatePresence mode="wait">
          {renderContent()}
        </AnimatePresence>
      </main>
    </div>
  );
}
