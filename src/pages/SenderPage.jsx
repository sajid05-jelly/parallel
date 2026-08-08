import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTransfer } from '../hooks/useTransfer';
import ParallelBackground from '../components/ParallelBackground';
import Navbar from '../components/Navbar';
import UploadPortal from '../components/UploadPortal';
import FileList from '../components/FileList';

import QRScreen from '../components/QRScreen';
import TransferProgress from '../components/TransferProgress';
import ErrorState from '../components/ErrorState';
import PortalAnimation from '../components/PortalAnimation';

export default function SenderPage() {
  const {
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
    reset
  } = useTransfer();

  const handleFilesSelected = (fileList) => {
    addFiles(fileList);
  };

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);

  const renderContent = () => {
    if (status === 'IDLE' || status === 'UPLOADING') {
      // Step 1: Mode Selection (Nearby ⚡ vs Anywhere 🌐)
      if (!mode) {
        return (
          <motion.div
            key="mode-selection"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-2xl mx-auto text-center"
          >
            <div className="mb-10">
              <span className="text-xs tracking-[0.25em] text-[#5C6462] font-mono uppercase mb-4 inline-block">
                Direct P2P File Transfer
              </span>
              <h1 className="font-space text-3xl md:text-5xl font-medium text-[#F5F5F2] leading-tight tracking-tight mb-3">
                How do you want to send?
              </h1>
              <p className="text-sm text-[#9CA3A2] max-w-md mx-auto">
                Choose the best transfer mode for your current devices and network.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-left mb-8">
              {/* MODE 1 — NEARBY ⚡ */}
              <button
                onClick={() => setMode('nearby')}
                className="group p-6 rounded-2xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] hover:border-[#D4A574]/40 transition-all text-left flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="w-12 h-12 rounded-xl bg-[#D4A574]/10 text-[#D4A574] text-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                      ⚡
                    </span>
                    <span className="text-[10px] font-mono uppercase tracking-widest px-2.5 py-1 rounded-full bg-[#D4A574]/10 text-[#D4A574]">
                      MAX SPEED
                    </span>
                  </div>
                  <h3 className="text-xl font-medium text-[#F5F5F2] mb-1 group-hover:text-[#D4A574] transition-colors">
                    Nearby Transfer
                  </h3>
                  <p className="text-xs text-[#9CA3A2] leading-relaxed mb-4">
                    Connect both devices to the same Wi-Fi for direct local LAN transfer.
                  </p>
                </div>
                <div className="text-[11px] text-[#5C6462] font-mono flex items-center gap-1 mt-2">
                  <span>Same Wi-Fi</span> &middot; <span>Ultra fast</span>
                </div>
              </button>

              {/* MODE 2 — ANYWHERE 🌐 */}
              <button
                onClick={() => setMode('anywhere')}
                className="group p-6 rounded-2xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] hover:border-[#5BA5A5]/40 transition-all text-left flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="w-12 h-12 rounded-xl bg-[#5BA5A5]/10 text-[#5BA5A5] text-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                      🌐
                    </span>
                    <span className="text-[10px] font-mono uppercase tracking-widest px-2.5 py-1 rounded-full bg-[#5BA5A5]/10 text-[#5BA5A5]">
                      UNIVERSAL
                    </span>
                  </div>
                  <h3 className="text-xl font-medium text-[#F5F5F2] mb-1 group-hover:text-[#5BA5A5] transition-colors">
                    Anywhere Transfer
                  </h3>
                  <p className="text-xs text-[#9CA3A2] leading-relaxed mb-4">
                    Send to devices on different networks, mobile data, or anywhere in the world.
                  </p>
                </div>
                <div className="text-[11px] text-[#5C6462] font-mono flex items-center gap-1 mt-2">
                  <span>Different networks</span> &middot; <span>Works anywhere</span>
                </div>
              </button>
            </div>
          </motion.div>
        );
      }

      // Step 2: File selection flow
      if (files.length === 0) {
        return (
          <motion.div 
            key="upload-portal"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="w-full"
          >
            <div className="text-center mb-8">
              <button
                onClick={() => setMode(null)}
                className="text-xs font-mono text-[#9CA3A2] hover:text-[#F5F5F2] mb-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.06] transition-colors"
              >
                <span>&larr;</span> Change Mode ({mode === 'nearby' ? '⚡ Nearby' : '🌐 Anywhere'})
              </button>
              <h1 className="font-space text-4xl md:text-5xl lg:text-6xl font-medium text-[#F5F5F2] leading-tight tracking-tight">
                Send anything.<br/>
                Through a temporary <span className="text-gradient-portal font-semibold">portal.</span>
              </h1>
              <p className="text-sm md:text-base text-[#9CA3A2] max-w-md mx-auto mt-4 leading-relaxed">
                {mode === 'nearby' 
                  ? 'Connect both devices to the same Wi-Fi for maximum speed direct LAN transfer.'
                  : 'Direct device-to-device file transfer across any network.'
                }
              </p>
            </div>

            <div className="max-w-xl mx-auto">
              {mode === 'nearby' && (
                <div className="mb-6 p-4 rounded-xl bg-[#D4A574]/10 border border-[#D4A574]/30 text-left flex items-start gap-3">
                  <span className="text-xl">⚠️</span>
                  <div>
                    <h4 className="text-xs font-bold text-[#D4A574] uppercase tracking-wider mb-1">
                      Same Wi-Fi Required
                    </h4>
                    <p className="text-xs text-[#9CA3A2] leading-relaxed">
                      Make sure both sender and receiver devices are connected to the <strong>SAME Wi-Fi network</strong> before scanning the QR code.
                    </p>
                  </div>
                </div>
              )}

              <UploadPortal onFilesSelected={handleFilesSelected} disabled={status === 'UPLOADING'} />
              
              <div className="flex items-center justify-center gap-6 text-xs text-[#5C6462] mt-6">
                <span className="flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                  End-to-end encrypted
                </span>
                <span>◌ No account needed</span>
                <span>⏱ 2-min expiry</span>
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
            className="w-full max-w-xl mx-auto bg-black/20 p-6 rounded-2xl border border-white/5 backdrop-blur-md"
          >
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

    if (status === 'WAITING' || status === 'CONNECTED') {
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
          />

        </motion.div>
      );
    }

    if (status === 'TRANSFERRING') {
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
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          className="text-center p-8"
        >
          <div className="w-20 h-20 mx-auto bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mb-6">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <h2 className="text-3xl font-medium text-[#F5F5F2] mb-4">Delivered.</h2>
          <p className="text-[#9CA3A2] mb-8">Your files have been securely transferred.</p>
          <button onClick={reset} className="px-8 py-3 bg-gradient-to-r from-[#D4A574] via-[#9CA3A2] to-[#5BA5A5] hover:opacity-95 text-[#090A0A] font-semibold rounded-xl transition-all active:scale-95 text-sm uppercase tracking-wide">
            Send Another
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
          <ErrorState type={errorType} message={error} onAction={reset} actionLabel="Try Again" />
        </motion.div>
      );
    }


    return null;
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      <ParallelBackground />
      <Navbar />
      
      <main className="flex-grow flex items-center justify-center px-4 pt-24 pb-12 z-10 relative">
        <AnimatePresence mode="wait">
          {renderContent()}
        </AnimatePresence>
      </main>
    </div>
  );
}
