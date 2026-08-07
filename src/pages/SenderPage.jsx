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
            <div className="text-center mb-10">
              <span className="text-xs tracking-[0.25em] text-[#5C6462] font-mono uppercase mb-4 inline-block">
                Private · Temporary · Instant
              </span>
              <h1 className="font-space text-4xl md:text-5xl lg:text-6xl font-medium text-[#F5F5F2] leading-tight tracking-tight">
                Send anything.<br/>
                Through a temporary <span className="text-gradient-portal font-semibold">portal.</span>
              </h1>
              <p className="text-sm md:text-base text-[#9CA3A2] max-w-md mx-auto mt-5 leading-relaxed">
                Direct device-to-device file transfer. No account required, zero cloud storage, complete privacy.
              </p>
            </div>


            
            <div className="max-w-xl mx-auto">
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
      } else {
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
