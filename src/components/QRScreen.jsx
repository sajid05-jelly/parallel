import React, { useEffect, useRef, useState } from 'react';
import QRCodeStyling from 'qr-code-styling';
import GlassCard from './GlassCard';
import { formatFileSize, formatDuration } from '../config/constants';

const QRScreen = ({ transferUrl, fileCount, totalSize, expiryDate, onCopyLink, onCancel, status }) => {
  const isExpired = status === 'EXPIRED';
  const isConnected = status === 'CONNECTED';
  const containerRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [remaining, setRemaining] = useState(120);

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
    if (!transferUrl || !containerRef.current || isExpired) return;
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
  }, [transferUrl, isExpired]);

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
          {!isExpired && (
            <span className="relative flex h-3 w-3">
              {status === 'WAITING' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>}
              <span className={`relative inline-flex rounded-full h-3 w-3 ${isConnected ? 'bg-emerald-500' : 'bg-teal-500'}`}></span>
            </span>
          )}
          <span className="text-sm font-medium text-[#9CA3A2]">
            {isExpired ? 'Portal closed' : isConnected ? 'Portal connected' : 'Portal is open'}
          </span>
        </div>

        {isExpired ? (
          <div className="py-8">
            <h3 className="text-xl text-[#F5F5F2] mb-2 font-light">Portal expired. No one connected.</h3>
            <button 
              onClick={onCancel}
              className="mt-6 px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-[#F5F5F2] text-sm font-medium transition-colors"
            >
              Create another portal
            </button>
          </div>
        ) : (
          <>
            <div className="relative mb-6">
              <div className="absolute inset-0 rounded-2xl bg-[#5BA5A5]/20 blur-xl animate-pulse"></div>
              <div className="relative bg-white p-3 rounded-2xl shadow-xl flex items-center justify-center min-w-[244px] min-h-[244px]" ref={containerRef}>
              </div>
            </div>

            <p className="text-[#F5F5F2] font-medium mb-1">Scan to receive all files</p>
            <p className="text-sm text-[#9CA3A2] mb-6">
              {fileCount} {fileCount === 1 ? 'file' : 'files'} · {formattedSize}
            </p>

            <div className="w-full bg-white/[0.04] rounded-xl p-3 mb-6 border border-white/[0.08]">
              <p className="text-sm text-[#9CA3A2]">
                Portal closes in <span className="text-[#5BA5A5] font-mono font-medium">{formatDuration(remaining)}</span>
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full">
              <button
                onClick={handleCopy}
                className="flex-1 py-2.5 rounded-xl border border-white/20 hover:bg-white/10 text-[#F5F5F2] text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
              <button
                onClick={onCancel}
                className="flex-1 py-2.5 rounded-xl text-[#9CA3A2] hover:text-[#F5F5F2] text-sm font-medium transition-colors"
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
              </div>
            )}
          </>
        )}
      </GlassCard>
    </div>
  );
};



export default QRScreen;
