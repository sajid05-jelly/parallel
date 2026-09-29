import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useReceiver from '../hooks/useReceiver';
import ParallelBackground from '../components/ParallelBackground';
import GlassCard from '../components/GlassCard';
import TransferProgress from '../components/TransferProgress';
import PatternLock from '../components/PatternLock';

import ErrorState from '../components/ErrorState';
import { formatFileSize, getFileIcon, getFileTypeCategory } from '../config/constants';
import { hashPattern, serializePattern } from '../lib/patternUtils';
import { getSessionByPattern } from '../lib/sessionManager';



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


function CategorySection({ title, emoji, items, onDownloadAll, onDownloadItem, zippingCategory }) {
  if (!items || items.length === 0) return null;
  
  const isZipping = zippingCategory === title;

  return (
    <div className="mb-8 w-full">
      <div className="flex items-center justify-between mb-3 border-b border-white/[0.08] pb-2">
        <h3 className="text-[#F3F4F6] font-semibold tracking-wide text-[13px] flex items-center gap-2 uppercase">
          <span>{emoji}</span> {title}
        </h3>
        <span className="text-[#9CA3AF] text-xs font-medium">{items.length} {items.length === 1 ? title.toLowerCase().replace(/s$/, '') : title.toLowerCase()}</span>
      </div>
      
      <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-2.5 space-y-2 mb-3">
        {items.map(item => (
          <FileDownloadItem
            key={item.idx}
            file={item.file}
            onDownload={() => onDownloadItem(item.idx)}
          />
        ))}
      </div>
      
      <button
        onClick={() => onDownloadAll(title, items)}
        disabled={isZipping}
        className="w-full py-2.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-[#E5E7EB] hover:text-white font-medium text-[13px] transition-all disabled:opacity-50 flex justify-center items-center gap-2"
      >
        {isZipping ? (
          <>
            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            Zipping...
          </>
        ) : (
          `Download All ${title}`
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

  const [zippingCategory, setZippingCategory] = useState(null);

  // Pattern landing flow state (when token is null — receiver entered via /receive)
  const [landingMethod, setLandingMethod] = useState(null); // null | 'pattern' | 'link'
  const [patternError, setPatternError] = useState(false);
  const [patternSuccess, setPatternSuccess] = useState(false);
  const [patternMessage, setPatternMessage] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [resolvedToken, setResolvedToken] = useState(token);
  const [resolvedKeyString, setResolvedKeyString] = useState(keyString);

  // Handle pattern match attempt
  const handlePatternComplete = useCallback(async (drawnPattern) => {
    setPatternError(false);
    setPatternSuccess(false);
    setPatternMessage('');

    try {
      const drawn_hash = await hashPattern(drawnPattern);
      const drawn_canonical = serializePattern(drawnPattern);

      console.log('[PATTERN DEBUG] receiver pattern:\n' + JSON.stringify({
        points: drawnPattern,
        canonical: drawn_canonical,
        hash: drawn_hash
      }, null, 2));

      const { session, error: lookupError } = await getSessionByPattern(drawn_hash);

      if (lookupError || !session) {
        const msg = lookupError?.message || '';
        if (msg === 'EXPIRED') {
          setPatternMessage('This portal has expired');
        } else if (msg === 'ALREADY_CONNECTED') {
          setPatternMessage('This portal is already connected');
        } else {
          setPatternMessage("Pattern doesn't match");
        }
        setPatternError(true);
        setTimeout(() => setPatternError(false), 800);
        return;
      }

      // Decode pattern_key_blob to get token + keyString
      if (!session.pattern_key_blob) {
        setPatternMessage("Pattern doesn't match");
        setPatternError(true);
        setTimeout(() => setPatternError(false), 800);
        return;
      }

      try {
        const decoded = JSON.parse(atob(session.pattern_key_blob));
        if (decoded.k && decoded.t) {
          setPatternSuccess(true);
          setPatternMessage('Pattern matched!');
          // Short delay to show success animation, then connect
          setTimeout(() => {
            setResolvedToken(decoded.t);
            setResolvedKeyString(decoded.k);
            setLandingMethod(null);
          }, 800);
        } else {
          setPatternMessage("Pattern doesn't match");
          setPatternError(true);
          setTimeout(() => setPatternError(false), 800);
        }
      } catch (e) {
        console.error('[ReceiverPage] Failed to decode pattern_key_blob:', e);
        setPatternMessage("Pattern doesn't match");
        setPatternError(true);
        setTimeout(() => setPatternError(false), 800);
      }
    } catch (err) {
      console.error('[ReceiverPage] Pattern lookup failed:', err);
      setPatternMessage('Connection error. Try again.');
      setPatternError(true);
      setTimeout(() => setPatternError(false), 800);
    }
  }, []);

  // Handle link entry
  const handleLinkSubmit = useCallback(() => {
    if (!linkInput.trim()) return;
    try {
      const url = new URL(linkInput.trim());
      const pathMatch = url.pathname.match(/\/receive\/([a-zA-Z0-9_-]+)$/);
      const keyMatch = url.hash.match(/^#key=([a-zA-Z0-9_-]+)$/);
      if (pathMatch && keyMatch) {
        setResolvedToken(pathMatch[1]);
        setResolvedKeyString(keyMatch[1]);
        setLandingMethod(null);
      } else {
        setPatternMessage('Invalid link format');
        setPatternError(true);
        setTimeout(() => setPatternError(false), 800);
      }
    } catch (e) {
      setPatternMessage('Invalid URL');
      setPatternError(true);
      setTimeout(() => setPatternError(false), 800);
    }
  }, [linkInput]);

  const handleDownloadAll = useCallback(async (categoryName, items) => {
    if (items.length === 0) return;
    if (items.length === 1) {
      return downloadFile(items[0].idx);
    }
    
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    
    if (isIOS) {
      const totalSize = items.reduce((acc, item) => acc + (item.file.size || 0), 0);
      if (totalSize > 800 * 1024 * 1024) {
        alert('Files are too large to ZIP on iOS. Please download them individually.');
        return;
      }
      
      try {
        setZippingCategory(categoryName);
        const { zip } = await import('fflate');
        const zipData = {};
        for (const item of items) {
          const blobData = getCompletedFileBlob(item.idx);
          if (blobData && blobData.blob) {
            const arrayBuffer = await blobData.blob.arrayBuffer();
            zipData[blobData.filename] = new Uint8Array(arrayBuffer);
          }
        }
        
        await new Promise((resolve, reject) => {
          zip(zipData, { level: 0 }, (err, zipped) => {
            if (err) return reject(err);
            const blob = new Blob([zipped], { type: 'application/zip' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${categoryName}_PARALLEL.zip`;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 60000);
            resolve();
          });
        });
      } catch (err) {
        console.error('ZIP creation failed:', err);
        alert('Failed to create ZIP file.');
      } finally {
        setZippingCategory(null);
      }
    } else {
      // Desktop/Android: Sequential native downloads
      for (const item of items) {
        await downloadFile(item.idx);
        await new Promise(r => setTimeout(r, 300));
      }
    }
  }, [getCompletedFileBlob]);

  // Called when the user taps Download for a specific file index
  const downloadFile = useCallback(async (idx) => {
    const item = getCompletedFileBlob(idx);
    if (!item) {
      console.warn('[ReceiverPage] No blob found for index', idx);
      return;
    }

    // Standard Blob URL Native Browser Download (iOS / Android / Desktop)
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
    if (resolvedToken && resolvedKeyString && !initializedPortals.has(resolvedToken)) {
      initializedPortals.add(resolvedToken);
      console.log('[ReceiverPage] Initializing connection for portal', resolvedToken);
      console.trace('[DIAG_TRACE_RECEIVER] connect called');
      connect(resolvedToken, resolvedKeyString);
    }
    
    return () => {
      // Delay removal to allow React StrictMode to remount without triggering a second connection
      setTimeout(() => {
        initializedPortals.delete(resolvedToken);
      }, 1000);
    };
  }, [resolvedToken, resolvedKeyString, connect]);

  const totalSize = files.reduce((acc, f) => acc + (f.size || 0), 0);

  return (
    <div className="min-h-[100dvh] flex flex-col text-[#F5F5F2] overflow-hidden relative">
      <ParallelBackground />
      
      <header className="absolute top-0 left-0 w-full p-4 sm:p-6 z-20 flex items-center justify-between">
        <div className="flex items-center gap-2.5 group">
          <div className="relative flex items-center justify-center transition-all duration-300 group-hover:drop-shadow-[0_0_8px_rgba(91,165,165,0.4)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="8" cy="12" r="6" stroke="#D4A574" strokeWidth="2.2" strokeOpacity="0.9"/>
              <circle cx="16" cy="12" r="6" stroke="#5BA5A5" strokeWidth="2.2" strokeOpacity="0.9"/>
            </svg>
          </div>
          <span className="font-space text-sm font-bold tracking-[0.22em] text-[#F5F5F2] uppercase group-hover:text-[#5BA5A5] transition-all duration-300 group-hover:[text-shadow:0_0_8px_rgba(91,165,165,0.3)]">
            PARALLEL
          </span>
        </div>
      </header>

      <main className="flex-grow flex flex-col items-center justify-center relative z-10 px-4 sm:px-6 w-full pb-[env(safe-area-inset-bottom)]">
        <AnimatePresence mode="wait">
          
          {/* PATTERN LANDING PAGE — when no token/URL provided */}
          {!resolvedToken && !resolvedKeyString && (
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-md mx-auto"
            >
              {!landingMethod && (
                <GlassCard className="flex flex-col items-center text-center p-6 md:p-8">
                  <h2 className="text-2xl font-semibold text-[#F5F5F2] mb-2 tracking-tight">Receive Files</h2>
                  <p className="text-sm text-[#9CA3A2] mb-8">Choose how to connect to the sender</p>

                  <div className="w-full space-y-3">
                    {/* Parallel Pattern */}
                    <button
                      onClick={() => setLandingMethod('pattern')}
                      className="w-full group p-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] hover:border-[#5BA5A5]/30 transition-all duration-200 text-left flex items-center gap-4"
                    >
                      <div className="w-10 h-10 rounded-lg bg-[#5BA5A5]/15 border border-[#5BA5A5]/25 flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5" fill="none" stroke="#5BA5A5" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="5" cy="5" r="1.5"></circle>
                          <circle cx="19" cy="5" r="1.5"></circle>
                          <circle cx="12" cy="12" r="1.5"></circle>
                          <circle cx="5" cy="19" r="1.5"></circle>
                          <circle cx="19" cy="19" r="1.5"></circle>
                          <line x1="6.5" y1="5" x2="17.5" y2="5"></line>
                          <line x1="19" y1="6.5" x2="12" y2="12"></line>
                          <line x1="12" y1="13.5" x2="5" y2="19"></line>
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#F5F5F2] group-hover:text-white">Parallel Pattern</p>
                        <p className="text-xs text-[#6B7280]">Draw the pattern shown on sender</p>
                      </div>
                      <svg className="w-4 h-4 text-[#6B7280] ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M9 18l6-6-6-6"></path></svg>
                    </button>

                    {/* Enter Link */}
                    <button
                      onClick={() => setLandingMethod('link')}
                      className="w-full group p-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] hover:border-[#D4A574]/30 transition-all duration-200 text-left flex items-center gap-4"
                    >
                      <div className="w-10 h-10 rounded-lg bg-[#D4A574]/15 border border-[#D4A574]/25 flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5" fill="none" stroke="#D4A574" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#F5F5F2] group-hover:text-white">Enter Link</p>
                        <p className="text-xs text-[#6B7280]">Paste the transfer link from sender</p>
                      </div>
                      <svg className="w-4 h-4 text-[#6B7280] ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M9 18l6-6-6-6"></path></svg>
                    </button>

                    {/* Scan QR */}
                    <div className="w-full p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] text-left flex items-center gap-4 opacity-70">
                      <div className="w-10 h-10 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5" fill="none" stroke="#9CA3A2" viewBox="0 0 24 24" strokeWidth="2">
                          <rect x="3" y="3" width="7" height="7" rx="1"></rect>
                          <rect x="14" y="3" width="7" height="7" rx="1"></rect>
                          <rect x="3" y="14" width="7" height="7" rx="1"></rect>
                          <rect x="14" y="14" width="3" height="3"></rect>
                          <rect x="18" y="18" width="3" height="3"></rect>
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#9CA3A2]">Scan QR Code</p>
                        <p className="text-xs text-[#5C6462]">Use your camera to scan the sender's QR</p>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => { window.location.href = '/'; }}
                    className="mt-6 text-xs text-[#6B7280] hover:text-[#F5F5F2] transition-colors"
                  >
                    ← Back to Home
                  </button>
                </GlassCard>
              )}

              {/* Pattern Input Screen */}
              {landingMethod === 'pattern' && (
                <GlassCard className="flex flex-col items-center text-center p-6 md:p-8">
                  <h2 className="text-lg font-semibold text-[#F5F5F2] mb-1 tracking-tight">Draw Parallel Pattern</h2>
                  <p className="text-sm text-[#9CA3A2] mb-6">Match the pattern shown on the sender</p>

                  <div className="relative bg-[#0A0C0D] p-4 rounded-2xl border border-white/[0.06] mb-4" style={{ minWidth: 260, minHeight: 260 }}>
                    <PatternLock
                      mode="input"
                      onPatternComplete={handlePatternComplete}
                      error={patternError}
                      success={patternSuccess}
                    />
                  </div>

                  {patternMessage && (
                    <p className={`text-sm font-medium mb-4 ${patternSuccess ? 'text-emerald-400' : patternError ? 'text-red-400' : 'text-[#9CA3A2]'}`}>
                      {patternSuccess ? '✓ ' : patternError ? '✗ ' : ''}{patternMessage}
                    </p>
                  )}

                  <button
                    onClick={() => { setLandingMethod(null); setPatternMessage(''); }}
                    className="text-sm text-[#6B7280] hover:text-[#F5F5F2] transition-colors"
                  >
                    ← Back
                  </button>
                </GlassCard>
              )}

              {/* Link Input Screen */}
              {landingMethod === 'link' && (
                <GlassCard className="flex flex-col items-center text-center p-6 md:p-8">
                  <h2 className="text-lg font-semibold text-[#F5F5F2] mb-1 tracking-tight">Enter Transfer Link</h2>
                  <p className="text-sm text-[#9CA3A2] mb-6">Paste the link from the sender</p>

                  <input
                    type="url"
                    value={linkInput}
                    onChange={(e) => setLinkInput(e.target.value)}
                    placeholder="https://...receive/..."
                    className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-[#F5F5F2] placeholder-[#5C6462] focus:outline-none focus:border-[#5BA5A5]/50 transition-colors mb-4"
                    onKeyDown={(e) => e.key === 'Enter' && handleLinkSubmit()}
                    autoFocus
                  />

                  {patternMessage && (
                    <p className="text-sm font-medium mb-4 text-red-400">✗ {patternMessage}</p>
                  )}

                  <button
                    onClick={handleLinkSubmit}
                    className="w-full py-2.5 rounded-xl bg-white text-[#090A0A] font-medium text-sm hover:bg-white/90 active:scale-[0.98] transition-all mb-3"
                  >
                    Connect
                  </button>

                  <button
                    onClick={() => { setLandingMethod(null); setPatternMessage(''); setLinkInput(''); }}
                    className="text-sm text-[#6B7280] hover:text-[#F5F5F2] transition-colors"
                  >
                    ← Back
                  </button>
                </GlassCard>
              )}
            </motion.div>
          )}

          {resolvedToken && (status === 'LOADING' || status === 'CREATING' || status === 'NEGOTIATING') && (
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
                  <p className="text-[13px] text-[#9CA3AF] mb-10">Establishing secure connection...</p>
                  
                  <div className="w-full relative flex items-center justify-between px-2 mb-2">
                    {/* Source Node (Laptop) */}
                    <div className="w-12 h-12 rounded-xl border border-white/[0.12] bg-white/[0.04] flex items-center justify-center z-10 shadow-[0_4px_20px_rgba(0,0,0,0.3)] backdrop-blur-md">
                      <svg className="w-5 h-5 text-[#F5F5F2]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
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
                    <div className="w-12 h-12 rounded-xl border border-white/[0.12] bg-white/[0.04] flex items-center justify-center z-10 shadow-[0_4px_20px_rgba(0,0,0,0.3)] backdrop-blur-md">
                      <svg className="w-5 h-5 text-[#F5F5F2]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
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
                    className="w-full min-h-[52px] py-3.5 rounded-xl bg-white text-[#090A0A] font-semibold text-[13px] uppercase tracking-widest hover:bg-white/90 active:scale-[0.98] transition-all duration-200 flex items-center justify-center group"
                  >
                    <span className="flex items-center justify-center gap-2.5">
                      <svg className="text-[#5BA5A5] group-hover:translate-y-[1px] transition-transform duration-200" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
                  className="relative w-20 h-20 mx-auto mb-6 z-10"
                >
                  <div className="absolute inset-0 rounded-full border-2 border-[#5BA5A5]/30 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]"></div>
                  <div className="w-full h-full bg-[#5BA5A5]/10 text-[#5BA5A5] rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(91,165,165,0.2)] border border-[#5BA5A5]/20">
                    <svg className="w-10 h-10 text-[#5BA5A5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </motion.div>
                <h2 className="text-3xl font-light mb-2 text-[#F5F5F2]">Transfer Complete</h2>
                <p className="text-[#9CA3A2] text-sm mb-4">{files.length} {files.length === 1 ? 'file' : 'files'} &middot; {formatFileSize(totalSize)} received &amp; verified.</p>
                
                <div className="w-full max-h-[60vh] overflow-y-auto mb-6 text-left custom-scrollbar pr-2">
                  {(() => {
                    const photos = [];
                    const videos = [];
                    const otherFiles = [];

                    files.forEach((file, idx) => {
                      const mime = (file.type || '').toLowerCase();
                      const name = (file.name || '').toLowerCase();
                      
                      const isPhoto = mime.startsWith('image/') || /\.(jpeg|jpg|png|webp|gif|heic|heif|bmp|svg|tiff)$/i.test(name);
                      const isVideo = mime.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi|m4v|3gp|wmv|flv)$/i.test(name);
                      
                      if (isPhoto) {
                        photos.push({ file, idx });
                      } else if (isVideo) {
                        videos.push({ file, idx });
                      } else {
                        otherFiles.push({ file, idx });
                      }
                    });

                    return (
                      <>
                        <CategorySection 
                          title="Photos" 
                          emoji="📸" 
                          items={photos} 
                          onDownloadAll={handleDownloadAll} 
                          onDownloadItem={downloadFile} 
                          zippingCategory={zippingCategory}
                        />
                        <CategorySection 
                          title="Videos" 
                          emoji="🎥" 
                          items={videos} 
                          onDownloadAll={handleDownloadAll} 
                          onDownloadItem={downloadFile} 
                          zippingCategory={zippingCategory}
                        />
                        <CategorySection 
                          title="Files" 
                          emoji="📁" 
                          items={otherFiles} 
                          onDownloadAll={handleDownloadAll} 
                          onDownloadItem={downloadFile} 
                          zippingCategory={zippingCategory}
                        />
                      </>
                    );
                  })()}
                </div>

                <button 
                  onClick={() => window.location.href = '/'}
                  className="w-full py-3 rounded-xl bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.1] hover:border-white/[0.15] text-[#F5F5F2] font-medium transition-all duration-200 active:scale-[0.98]"
                >
                  Back to Home
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
