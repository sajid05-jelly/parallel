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
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-2xl mx-auto text-center"
          >
            <div className="mb-12">
              <span className="text-[11px] font-medium tracking-widest text-[#9CA3AF] uppercase mb-4 inline-block">
                Direct P2P File Transfer
              </span>
              <h1 className="text-4xl md:text-[44px] font-semibold text-[#F3F4F6] leading-tight tracking-tight mb-4">
                Choose transfer mode
              </h1>
              <p className="text-[15px] text-[#6B7280] max-w-md mx-auto leading-relaxed">
                Select the fastest route based on your current network environment.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left mb-8">
              {/* MODE 1 — NEARBY ⚡ */}
              <button
                onClick={() => setMode('nearby')}
                className="group p-7 rounded-[20px] bg-[#0C0D0E] hover:bg-[#121315] border border-[#ffffff0a] hover:border-[#D4A574]/30 transition-colors text-left flex flex-col shadow-sm"
              >
                <div className="flex items-center justify-between mb-5">
                  <div className="w-10 h-10 rounded-full bg-[#D4A574]/10 flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4A574" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                  </div>
                  <span className="text-[10px] font-medium tracking-wider px-2.5 py-1 rounded-full bg-[#D4A574]/10 text-[#D4A574] uppercase">
                    Max Speed
                  </span>
                </div>
                <h3 className="text-lg font-medium text-[#F3F4F6] mb-2 group-hover:text-white transition-colors">
                  Nearby Transfer
                </h3>
                <p className="text-[13.5px] text-[#9CA3AF] leading-relaxed mb-5 flex-grow">
                  Connect both devices to the same Wi-Fi for instant local network transfer.
                </p>
                <div className="pt-4 border-t border-[#ffffff0a] flex items-center gap-4 text-[12px] text-[#6B7280]">
                  <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-[#6B7280]"></div> Same Wi-Fi</span>
                  <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-[#6B7280]"></div> P2P Direct</span>
                </div>
              </button>

              {/* MODE 2 — ANYWHERE 🌐 */}
              <button
                onClick={() => setMode('anywhere')}
                className="group p-7 rounded-[20px] bg-[#0C0D0E] hover:bg-[#121315] border border-[#ffffff0a] hover:border-[#5BA5A5]/30 transition-colors text-left flex flex-col shadow-sm"
              >
                <div className="flex items-center justify-between mb-5">
                  <div className="w-10 h-10 rounded-full bg-[#5BA5A5]/10 flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5BA5A5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                  </div>
                  <span className="text-[10px] font-medium tracking-wider px-2.5 py-1 rounded-full bg-[#5BA5A5]/10 text-[#5BA5A5] uppercase">
                    Universal
                  </span>
                </div>
                <h3 className="text-lg font-medium text-[#F3F4F6] mb-2 group-hover:text-white transition-colors">
                  Anywhere Transfer
                </h3>
                <p className="text-[13.5px] text-[#9CA3AF] leading-relaxed mb-5 flex-grow">
                  Send securely across different networks, mobile data, or anywhere in the world.
                </p>
                <div className="pt-4 border-t border-[#ffffff0a] flex items-center gap-4 text-[12px] text-[#6B7280]">
                  <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-[#6B7280]"></div> Any Network</span>
                  <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-[#6B7280]"></div> Encrypted</span>
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
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="w-full"
          >
            <div className="max-w-xl mx-auto mb-8 relative">
              <button
                onClick={() => setMode(null)}
                className="absolute -top-12 left-0 text-[13px] text-[#9CA3AF] hover:text-[#F3F4F6] flex items-center gap-2 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                Back to Modes
              </button>
              
              <h1 className="text-3xl md:text-[36px] font-semibold text-[#F3F4F6] leading-tight tracking-tight mb-2">
                Share files securely
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
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          className="text-center p-8 max-w-md mx-auto bg-[#0C0D0E]/60 border border-[#ffffff10] backdrop-blur-xl rounded-[24px] shadow-sm"
        >
          <div className="w-16 h-16 mx-auto bg-green-500/10 text-green-400 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(34,197,94,0.15)]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <h2 className="text-2xl font-semibold text-[#F3F4F6] mb-2 tracking-tight">Transfer complete</h2>
          <p className="text-[14px] text-[#9CA3AF] mb-8 leading-relaxed">Your files have been securely transferred and saved on the receiver device.</p>
          <button onClick={reset} className="w-full py-3 bg-white text-black font-medium rounded-xl hover:bg-gray-100 transition-colors shadow-sm">
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
