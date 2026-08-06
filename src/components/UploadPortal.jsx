import React, { useRef, useState } from 'react';
import GlassCard from './GlassCard';

const UploadPortal = ({ onFilesSelected, disabled = false }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (disabled) return;
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(e.target.files);
    }
    // Reset so same file can be selected again
    e.target.value = '';
  };

  const handleButtonClick = (e) => {
    e.stopPropagation();
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <>
      <input 
        type="file" 
        multiple 
        className="hidden" 
        ref={fileInputRef}
        onChange={handleFileInputChange}
      />
      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <GlassCard 
          className={`min-h-[220px] md:min-h-[280px] flex flex-col items-center justify-center text-center transition-all duration-300 ${isDragging ? 'border-[#D4A574] bg-white/[0.06]' : ''}`}
          glow={isDragging}
          glowColor="warm"
        >
          <div className="mb-6">
            <svg width="80" height="80" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="40" cy="50" r="30" fill="#D4A574" fillOpacity="0.15"/>
              <circle cx="60" cy="50" r="30" fill="#5BA5A5" fillOpacity="0.15"/>
              <circle cx="40" cy="50" r="28" stroke="#D4A574" strokeWidth="1" strokeOpacity="0.4"/>
              <circle cx="60" cy="50" r="28" stroke="#5BA5A5" strokeWidth="1" strokeOpacity="0.4"/>
            </svg>
          </div>
          
          <h3 className="text-xl font-medium text-[#F5F5F2] mb-2">
            {isDragging ? 'Drop to open portal' : 'Open a Portal'}
          </h3>
          
          {!isDragging && (
            <p className="text-sm text-[#9CA3A2] mb-6">
              Drop files anywhere here
            </p>
          )}

          <div className="flex items-center w-full max-w-[200px] mb-6">
            <div className="flex-grow border-t border-white/[0.06]"></div>
            <span className="mx-4 text-xs text-[#5C6462]">or</span>
            <div className="flex-grow border-t border-white/[0.06]"></div>
          </div>

          <button 
            type="button"
            onClick={handleButtonClick}
            disabled={disabled}
            className="px-8 py-3 rounded-xl bg-[#F5F5F2] text-[#090A0A] font-semibold text-sm tracking-wide hover:bg-white hover:shadow-lg transform hover:-translate-y-0.5 active:translate-y-0 active:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mb-4"
          >
            CHOOSE FILES
          </button>
          
          <p className="text-xs text-[#5C6462]">
            Photos · Videos · Documents · More
          </p>
        </GlassCard>
      </div>
    </>
  );
};

export default UploadPortal;
