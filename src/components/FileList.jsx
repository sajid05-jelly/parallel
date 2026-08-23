import React, { useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import FileCard from './FileCard';
import { formatFileSize } from '../config/constants';

const FileList = ({ files, onRemoveFile, onAddMore, onCreatePortal, totalSize, isUploading = false }) => {
  const hiddenInputRef = useRef(null);

  const handleAddMoreClick = () => {
    if (hiddenInputRef.current) {
      hiddenInputRef.current.click();
    }
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddMore(e.target.files);
    }
    e.target.value = '';
  };

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col h-full max-h-[70vh]">
      <input 
        type="file"
        multiple
        className="hidden"
        ref={hiddenInputRef}
        onChange={handleFileInputChange}
      />
      
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-medium text-[#F5F5F2]">Selected files</h3>
        <button 
          onClick={handleAddMoreClick}
          disabled={isUploading}
          className="text-sm text-[#9CA3A2] hover:text-[#F5F5F2] flex items-center gap-1 transition-colors disabled:opacity-50"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Add files
        </button>
      </div>

      <div className="overflow-y-auto pr-2 space-y-2 mb-4">
        <AnimatePresence mode="popLayout">
          {files.map((file, index) => (
            <FileCard 
              key={file.id} 
              file={file} 
              index={index} 
              onRemove={onRemoveFile} 
            />
          ))}
        </AnimatePresence>
      </div>

      <div className="border-t border-white/[0.06] pt-4 mt-auto flex items-center justify-between">
        <div className="text-sm text-[#9CA3A2]">
          {files.length} {files.length === 1 ? 'file' : 'files'} · {formatFileSize ? formatFileSize(totalSize) : `${Math.round(totalSize/1024)} KB`}
        </div>
        
        <button
          onClick={onCreatePortal}
          disabled={isUploading || files.length === 0}
          className="relative overflow-hidden px-8 py-3.5 rounded-xl bg-gradient-to-r from-teal-500/10 via-violet-500/10 to-teal-500/10 border border-teal-500/20 backdrop-blur-md text-[#F3F4F6] font-medium text-[13px] uppercase tracking-widest hover:border-violet-500/40 hover:bg-white/[0.05] hover:shadow-[0_0_20px_rgba(139,92,246,0.15)] active:scale-[0.98] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 group"
        >
          {/* Crystal inner reflection */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.08] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-xl"></div>
          
          {isUploading ? (
            <span className="relative z-10 flex items-center gap-2">
              <svg className="animate-spin h-4 w-4 text-violet-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Opening portal...
            </span>
          ) : (
            <span className="relative z-10 flex items-center gap-2">
              CREATE PORTAL
              <svg className="text-teal-400 group-hover:translate-x-1 transition-transform duration-300" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
            </span>
          )}
        </button>
      </div>
    </div>
  );
};

export default FileList;
