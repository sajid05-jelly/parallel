import React, { useRef, useState } from 'react';

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
        className="w-full"
      >
        <div 
          className={`min-h-[260px] md:min-h-[300px] flex flex-col items-center justify-center text-center transition-all duration-300 rounded-[24px] border-2 border-dashed ${
            isDragging 
              ? 'border-[#D4A574]/40 bg-[#D4A574]/[0.02]' 
              : 'border-[#ffffff10] bg-[#0C0D0E]/60 hover:border-[#ffffff20] hover:bg-[#121315]/80'
          }`}
        >
          <div className="mb-5 flex items-center justify-center w-16 h-16 rounded-full bg-white/[0.02] border border-white/[0.05]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 16V8M12 8L8.5 11.5M12 8L15.5 11.5" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4 16.5C4 18.433 5.567 20 7.5 20H16.5C18.433 20 20 18.433 20 16.5" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          
          <h3 className="text-[17px] font-medium text-[#F3F4F6] mb-1.5 tracking-tight">
            {isDragging ? 'Drop files here' : 'Upload your files'}
          </h3>
          
          {!isDragging && (
            <p className="text-[13px] text-[#9CA3AF] mb-6">
              Drag and drop them here
            </p>
          )}

          <div className="flex items-center w-full max-w-[200px] mb-6 opacity-40">
            <div className="flex-grow border-t border-white/[0.08]"></div>
            <span className="mx-4 text-[11px] font-medium text-[#9CA3AF] uppercase tracking-wider">or</span>
            <div className="flex-grow border-t border-white/[0.08]"></div>
          </div>

          <button 
            type="button"
            onClick={handleButtonClick}
            disabled={disabled}
            className="px-6 py-2.5 rounded-lg bg-white text-black font-medium text-[13px] hover:bg-gray-100 active:bg-gray-200 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed mb-4 shadow-sm"
          >
            Browse files
          </button>
          
          <p className="text-[12px] text-[#6B7280]">
            Photos, videos, and documents up to 500MB
          </p>
        </div>
      </div>
    </>
  );
};

export default UploadPortal;
