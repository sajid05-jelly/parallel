import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useReceiver from '../hooks/useReceiver';
import ParallelBackground from '../components/ParallelBackground';
import GlassCard from '../components/GlassCard';
import TransferProgress from '../components/TransferProgress';
import PortalAnimation from '../components/PortalAnimation';
import ErrorState from '../components/ErrorState';
import { formatFileSize, getFileIcon, getFileTypeCategory } from '../config/constants';

function FileSaveItem({ file, btnLabel, onSave }) {
  const [isPreparing, setIsPreparing] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const handleSaveClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isPreparing) return;

    setIsPreparing(true);
    setSaveError(null);

    try {
      await onSave();
    } catch (err) {
      console.error('File save error:', err);
      setSaveError('Unable to save this file. Please try again.');
    } finally {
      setIsPreparing(false);
    }
  };

  return (
    <div className="flex flex-col p-3 rounded-xl bg-white/[0.04] border border-white/[0.08]">
      <div className="flex items-center justify-between">
        <div className="min-w-0 pr-3">
          <p className="text-xs font-medium text-[#F5F5F2] truncate">{file.name}</p>
          <p className="text-[10px] text-[#9CA3A2]">{formatFileSize(file.size)}</p>
        </div>
        <button
          type="button"
          onClick={handleSaveClick}
          disabled={isPreparing}
          className="px-3.5 py-1.5 rounded-lg bg-[#5BA5A5]/25 hover:bg-[#5BA5A5]/40 text-[#5BA5A5] hover:text-white text-xs font-semibold transition-all flex-shrink-0 flex items-center gap-1.5 border border-[#5BA5A5]/30 cursor-pointer disabled:opacity-50"
        >
          {isPreparing ? (
            <>
              <span className="w-3 h-3 border-2 border-teal-400 border-t-transparent rounded-full animate-spin"></span>
              Preparing…
            </>
          ) : (
            <>
              <span>📥</span> {btnLabel}
            </>
          )}
        </button>
      </div>
      {saveError && (
        <p className="text-[11px] text-red-400 mt-2 font-medium">{saveError}</p>
      )}
    </div>
  );
}

export default function ReceiverPage({ token, keyString }) {

  const {
    status,
    files,
    progress,
    error,
    connect,
    acceptTransfer,
    saveFileItem
  } = useReceiver();




  useEffect(() => {
    if (token && keyString) {
      connect(token, keyString);
    }
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
              className="w-full max-w-sm mx-auto flex flex-col items-center text-center"
            >
              <PortalAnimation stage="opening" />
              <h2 className="mt-8 text-xl font-light text-[#F5F5F2]">Connecting portal…</h2>
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
                    className="w-full min-h-[52px] py-3.5 rounded-xl font-semibold text-[#090A0A] bg-gradient-to-r from-[#D4A574] via-[#B89B8A] to-[#5BA5A5] hover:opacity-95 transition-all active:scale-[0.98] tracking-wide text-sm uppercase"
                  >
                    RECEIVE EVERYTHING
                  </button>
                </div>
              </GlassCard>
            </motion.div>
          )}

          {status === 'TRANSFERRING' && (
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
                <p className="text-[#9CA3A2] text-sm mb-4">{files.length} {files.length === 1 ? 'file' : 'files'} received & verified.</p>
                
                <div className="w-full max-h-56 overflow-y-auto space-y-2.5 mb-6 text-left">
                  {files.map((file, idx) => {
                    const isImage = file.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(file.name);
                    const isVideo = file.type?.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm)$/i.test(file.name);
                    
                    const btnLabel = isImage ? 'Save Photo' : isVideo ? 'Save Video' : 'Save File';

                    return (
                      <FileSaveItem 
                        key={idx} 
                        file={file} 
                        btnLabel={btnLabel} 
                        onSave={() => saveFileItem(idx)} 
                      />
                    );
                  })}
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
