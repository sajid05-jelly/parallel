import React, { useEffect, useRef, useState } from 'react';
import QRCodeStyling from 'qr-code-styling';
import GlassCard from './GlassCard';
import PatternLock from './PatternLock';
import { formatFileSize, formatDuration } from '../config/constants';

const QRScreen = ({ transferUrl, fileCount, totalSize, expiryDate, onCopyLink, onCancel, status, mode, pattern }) => {

  const isExpired = status === 'EXPIRED';
  const isConnected = status === 'CONNECTED';
  const containerRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [remaining, setRemaining] = useState(120);
  const [activeTab, setActiveTab] = useState('qr'); // 'qr' or 'pattern'

  // Countdown timer
  useEffect(() => {
    if (!expiryDate) return;
    const interval = setInterval(() => {
      const diff = Math.max(0, Math.floor((new Date(expiryDate).getTime() - Date.now()) / 1000));
      setRemaining(diff);
      if (diff <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [expiryDate]);

  // Render QR Code
  useEffect(() => {
    if (!transferUrl || !containerRef.current || isExpired || activeTab !== 'qr') return;
    containerRef.current.innerHTML = '';
    const qrCode = new QRCodeStyling({
      width: 220,
      height: 220,
      type: 'svg',
      data: transferUrl,
      dotsOptions: { color: '#090A0A', type: 'rounded' },
      backgroundOptions: { color: '#ffffff' },
      cornersSquareOptions: { type: 'extra-rounded', color: '#090A0A' },
      cornersDotOptions: { type: 'dot', color: '#5BA5A5' },
      qrOptions: { errorCorrectionLevel: 'M' }
    });
    qrCode.append(containerRef.current);
  }, [transferUrl, isExpired, activeTab]);

  const handleCopy = () => {
    if (transferUrl) {
      navigator.clipboard.writeText(transferUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
    if (onCopyLink) onCopyLink();
  };

  const formattedSize = typeof totalSize === 'number' ? formatFileSize(totalSize) : totalSize;

  return (
    <div className="w-full max-w-md mx-auto">
      <GlassCard className="flex flex-col items-center text-center p-6 md:p-8">
        
        <div className="flex items-center gap-2 mb-6">
          <span className="relative flex h-3 w-3">
            {!isExpired && status === 'WAITING' && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#5BA5A5] opacity-75"></span>
            )}
            <span className={`relative inline-flex rounded-full h-3 w-3 ${isExpired ? 'bg-[#6B7280]' : isConnected ? 'bg-emerald-500' : 'bg-[#5BA5A5]'}`}></span>
          </span>
          <span className={`text-sm font-medium ${isExpired ? 'text-[#6B7280] line-through' : 'text-[#9CA3A2]'}`}>
            {isExpired ? 'Portal closed' : isConnected ? 'Device connected' : mode === 'nearby' ? 'Waiting for nearby device...' : 'Portal is open'}
          </span>
        </div>

        {isExpired ? (
          <div className="py-8">
            <h3 className="text-xl text-[#F5F5F2] mb-2 font-light">Portal expired. No one connected.</h3>
            <button 
              onClick={onCancel}
              className="mt-6 px-6 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.1] hover:border-white/[0.15] text-[#F5F5F2] text-sm font-medium transition-colors"
            >
              Create another portal
            </button>
          </div>
        ) : (
          <>
            {/* Tab switcher — QR Code / Pattern */}
            {pattern && pattern.length > 0 && (
              <div className="flex w-full mb-6 bg-white/[0.04] rounded-xl p-1 border border-white/[0.06]">
                <button
                  onClick={() => setActiveTab('qr')}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 ${
                    activeTab === 'qr'
                      ? 'bg-white/[0.08] text-[#F5F5F2] shadow-sm'
                      : 'text-[#6B7280] hover:text-[#9CA3A2]'
                  }`}
                >
                  <span className="flex items-center justify-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <rect x="3" y="3" width="7" height="7" rx="1"></rect>
                      <rect x="14" y="3" width="7" height="7" rx="1"></rect>
                      <rect x="3" y="14" width="7" height="7" rx="1"></rect>
                      <rect x="14" y="14" width="3" height="3"></rect>
                      <rect x="18" y="18" width="3" height="3"></rect>
                      <rect x="18" y="14" width="3" height="1"></rect>
                      <rect x="14" y="18" width="1" height="3"></rect>
                    </svg>
                    QR Code
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('pattern')}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 ${
                    activeTab === 'pattern'
                      ? 'bg-white/[0.08] text-[#F5F5F2] shadow-sm'
                      : 'text-[#6B7280] hover:text-[#9CA3A2]'
                  }`}
                >
                  <span className="flex items-center justify-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="5" cy="5" r="2"></circle>
                      <circle cx="19" cy="5" r="2"></circle>
                      <circle cx="12" cy="12" r="2"></circle>
                      <circle cx="5" cy="19" r="2"></circle>
                      <circle cx="19" cy="19" r="2"></circle>
                      <line x1="7" y1="5" x2="17" y2="5"></line>
                      <line x1="19" y1="7" x2="12" y2="12"></line>
                      <line x1="12" y1="14" x2="5" y2="19"></line>
                    </svg>
                    Pattern
                  </span>
                </button>
              </div>
            )}

            {/* QR Code tab content */}
            {activeTab === 'qr' && (
              <>
                <div className="relative mb-6 flex items-center justify-center p-1 overflow-hidden rounded-[20px]">
                  <div className="absolute inset-0 bg-[conic-gradient(from_0deg,#5BA5A5,#D4A574,#5BA5A5)] opacity-20 animate-[spin_8s_linear_infinite]"></div>
                  <div className="relative bg-white p-3 rounded-2xl shadow-xl flex items-center justify-center min-w-[244px] min-h-[244px] z-10" ref={containerRef}>
                  </div>
                </div>

                <p className="text-[#F5F5F2] font-medium mb-1">
                  {mode === 'nearby' ? 'Scan to pair nearby device' : 'Scan to receive all files'}
                </p>
              </>
            )}

            {/* Pattern tab content */}
            {activeTab === 'pattern' && pattern && (
              <>
                <div className="relative mb-6 flex items-center justify-center p-1 overflow-hidden rounded-[20px]">
                  <div className="absolute inset-0 bg-[conic-gradient(from_0deg,#5BA5A5,#D4A574,#5BA5A5)] opacity-10 animate-[spin_8s_linear_infinite] rounded-[20px]"></div>
                  <div className="relative bg-[#0A0C0D] p-4 rounded-2xl border border-white/[0.06] z-10 flex items-center justify-center" style={{ minWidth: 260, minHeight: 260 }}>
                    <PatternLock
                      pattern={pattern}
                      mode="display"
                    />
                  </div>
                </div>

                <p className="text-[#F5F5F2] font-medium mb-1">
                  Draw this pattern on the receiving device
                </p>
              </>
            )}

            <p className="text-sm text-[#9CA3A2] mb-6">
              {fileCount} {fileCount === 1 ? 'file' : 'files'} · {formattedSize}
            </p>

            <div className="w-full bg-white/[0.04] rounded-xl p-3 mb-6 border border-white/[0.08]">
              <p className="text-sm text-[#9CA3A2]">
                {mode === 'nearby' ? 'Connect both devices to same Wi-Fi' : 'Portal closes in '} 
                <span className={`font-mono tabular-nums font-medium ${remaining < 10 ? 'text-red-400' : remaining < 30 ? 'text-amber-400' : 'text-[#5BA5A5]'}`}>
                  {mode === 'nearby' ? '' : formatDuration(remaining)}
                </span>
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full">
              <button
                onClick={handleCopy}
                className={`flex-1 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.1] hover:border-white/[0.15] text-sm font-medium transition-colors flex items-center justify-center gap-2 ${copied ? 'text-[#5BA5A5]' : 'text-[#F5F5F2]'}`}
              >
                {copied ? (
                  <>
                    <span>✓ Copied</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    Copy Link
                  </>
                )}
              </button>
              <button
                onClick={onCancel}
                className="flex-1 py-2.5 rounded-xl text-[#6B7280] hover:text-[#F5F5F2] text-sm font-medium transition-colors"
              >
                Cancel Portal
              </button>
            </div>

            {process.env.NODE_ENV === 'development' && (
              <div className="w-full mt-6 p-3 rounded-xl bg-black/40 border border-white/10 text-left text-xs space-y-1 font-mono text-[#9CA3A2]">
                <div className="text-amber-400 font-bold mb-1">[DEV Session Debug]</div>
                <div>Status: <span className="text-white">{status}</span></div>
                <div>Remaining: <span className="text-white">{remaining}s</span></div>
                <div>URL Origin: <span className="text-teal-400">{transferUrl ? new URL(transferUrl).origin : 'N/A'}</span></div>
                {pattern && <div>Pattern: <span className="text-teal-400">{pattern.join('-')}</span></div>}
              </div>
            )}
          </>
        )}
      </GlassCard>
    </div>
  );
};

export default QRScreen;
