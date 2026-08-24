import React from 'react';
import GlassCard from './GlassCard';

const TransferProgress = ({ progress = {}, direction = 'sending', status }) => {
  const { percentage = 0, speed = 0, currentFile = null, totalFiles = 1, eta = 0 } = progress;
  const isComplete = status === 'completed' || status === 'COMPLETED';

  // Format filename safely
  const fileName = typeof currentFile === 'object' && currentFile !== null ? currentFile.name : (currentFile || 'File');
  
  // Format Speed safely
  const speedDisplay = typeof speed === 'number' ? `${(speed / (1024 * 1024)).toFixed(1)} MB/s` : (speed || '0 MB/s');

  // Format ETA safely
  let etaDisplay = 'Calculating...';
  if (typeof eta === 'number') {
    if (eta <= 0 && !isComplete) {
      etaDisplay = '<1s remaining';
    } else {
      etaDisplay = `${Math.ceil(eta)}s remaining`;
    }
  } else if (eta) {
    etaDisplay = eta;
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <style>{`
        @keyframes streamFlow {
          0% { transform: translateX(-100%); opacity: 0; }
          5% { opacity: 1; }
          95% { opacity: 1; }
          100% { transform: translateX(0%); opacity: 0; }
        }
        .data-packet {
          animation: streamFlow 1.5s linear infinite;
        }
        .data-packet-2 { animation-delay: 0.5s; }
        .data-packet-3 { animation-delay: 1.0s; }
      `}</style>
      
      <GlassCard className="flex flex-col p-8 rounded-[24px]">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className={`w-2.5 h-2.5 rounded-full ${isComplete ? 'bg-[#5BA5A5]' : status === 'RECOVERING' ? 'bg-[#D4A574] animate-pulse shadow-[0_0_10px_rgba(212,165,116,0.6)]' : 'bg-[#5BA5A5] animate-pulse shadow-[0_0_10px_rgba(91,165,165,0.6)]'}`}></div>
          <h3 className="text-[13px] font-semibold text-[#F3F4F6] uppercase tracking-widest">
            {isComplete 
              ? (direction === 'sending' ? 'Transfer Complete' : 'Transfer Complete')
              : status === 'RECOVERING'
                ? 'Reconnecting...'
                : (direction === 'sending' ? 'Sending Data...' : 'Receiving Data...')
            }
          </h3>
        </div>

        {/* Data Stream Animation */}
        {!isComplete && (
          <div className={`w-full relative flex items-center justify-between mb-10 mt-2 px-1 ${status === 'RECOVERING' ? 'opacity-30' : ''}`}>
            {/* Source Node */}
            <div className="w-10 h-10 rounded-full border border-white/[0.08] bg-white/[0.02] flex items-center justify-center z-10 shadow-[0_4px_15px_rgba(0,0,0,0.2)]">
              <svg className="w-4 h-4 text-[#9CA3AF]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
            </div>

            {/* Path & Packets */}
            <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent via-white/[0.15] to-transparent relative mx-3 overflow-visible">
              <div className="absolute top-[-2px] left-0 w-full h-full data-packet">
                <div className="absolute right-0 w-1.5 h-1.5 rounded-full bg-[#5BA5A5] shadow-[0_0_8px_rgba(91,165,165,0.8)]"></div>
              </div>
              
              <div className="absolute top-[-1px] left-0 w-full h-full data-packet data-packet-2">
                <div className="absolute right-0 w-1 h-1 rounded-full bg-[#D4A574] shadow-[0_0_8px_rgba(212,165,116,0.8)]"></div>
              </div>

              <div className="absolute top-[-2px] left-0 w-full h-full data-packet data-packet-3">
                <div className="absolute right-0 w-1.5 h-1.5 rounded-full bg-[#5BA5A5] shadow-[0_0_8px_rgba(91,165,165,0.8)]"></div>
              </div>
            </div>

            {/* Dest Node */}
            <div className="w-10 h-10 rounded-full border border-white/[0.08] bg-white/[0.02] flex items-center justify-center z-10 shadow-[0_4px_15px_rgba(0,0,0,0.2)]">
              <svg className="w-4 h-4 text-[#9CA3AF]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                <line x1="12" y1="18" x2="12.01" y2="18"></line>
              </svg>
            </div>
          </div>
        )}

        {/* Progress Bar & Stats */}
        <div className="w-full">
          <div className="flex justify-between items-end w-full mb-3">
            <span className="text-4xl font-light text-[#F3F4F6] tracking-tight">
              {(Number(percentage) || 0).toFixed(1)}<span className="text-xl text-[#9CA3AF] ml-0.5">%</span>
            </span>
            {!isComplete && (
              <span className="text-[14px] font-medium text-[#5BA5A5] mb-1.5">
                {speedDisplay}
              </span>
            )}
          </div>

          <div className="h-1.5 w-full bg-white/[0.05] rounded-full overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] mb-6 relative">
            <div 
              className="h-full bg-gradient-to-r from-[#D4A574] via-[#5BA5A5] to-[#5BA5A5] rounded-full transition-all duration-300 ease-out relative"
              style={{ width: `${percentage}%` }}
            >
              {/* Glossy tip */}
              <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-r from-transparent to-white/40 blur-[1.5px]"></div>
            </div>
          </div>

          {/* File Info Footer */}
          <div className="flex justify-between items-end w-full">
            <div className="flex flex-col">
              <span className="text-[10px] text-[#9CA3AF] uppercase tracking-widest mb-1.5">
                {direction === 'sending' ? 'Sending' : 'Receiving'}
              </span>
              <span className="text-[13px] font-medium text-[#E5E7EB] truncate max-w-[200px]">
                {fileName} <span className="text-[#9CA3AF] font-normal ml-1.5">({totalFiles} files)</span>
              </span>
            </div>
            
            {!isComplete && (
              <div className="text-[13px] text-[#9CA3AF]">
                {etaDisplay}
              </div>
            )}
          </div>
        </div>
      </GlassCard>
    </div>
  );
};

export default TransferProgress;
