import React from 'react';
import GlassCard from './GlassCard';
import PortalAnimation from './PortalAnimation';

const TransferProgress = ({ progress = {}, direction = 'sending', status }) => {
  const { percentage = 0, speed = '0 MB/s', currentFile = 1, totalFiles = 1, eta = 'Calculating...' } = progress;
  const isComplete = status === 'completed';

  return (
    <div className="w-full max-w-md mx-auto">
      <GlassCard className="flex flex-col items-center">
        
        <h3 className="text-lg font-medium text-white mb-6">
          {isComplete 
            ? (direction === 'sending' ? 'Delivered.' : 'Everything arrived.')
            : (direction === 'sending' ? 'Sending...' : 'Receiving...')
          }
        </h3>

        <div className="mb-8">
          {isComplete ? (
            <div className="w-32 h-32 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg className="w-16 h-16 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          ) : (
            <PortalAnimation stage="open" progress={percentage} />
          )}
        </div>

        <div className="w-full mb-2">
          <div className="h-2 w-full bg-white/[0.05] rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-violet-500 to-blue-500 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${percentage}%` }}
            ></div>
          </div>
        </div>

        <div className="flex justify-between w-full text-sm mb-6">
          <span className="text-white font-medium">{percentage.toFixed(1)}%</span>
          {!isComplete && <span className="text-gray-400">{speed}</span>}
        </div>

        <p className="text-gray-300 text-sm mb-1">
          {direction === 'sending' ? 'Sending' : 'Receiving'} {currentFile} / {totalFiles} files
        </p>
        
        {!isComplete && (
          <p className="text-gray-500 text-xs">
            {eta}
          </p>
        )}

        {isComplete && (
          <button className="mt-6 px-6 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors w-full">
            {direction === 'sending' ? 'Create another portal' : 'Download All'}
          </button>
        )}
      </GlassCard>
    </div>
  );
};

export default TransferProgress;
