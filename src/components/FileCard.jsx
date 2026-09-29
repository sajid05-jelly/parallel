import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { formatFileSize } from '../config/constants';

const FileCard = ({ file, onRemove, index }) => {
  const [localPreview, setLocalPreview] = useState(null);

  useEffect(() => {
    let url = null;
    let timer = setTimeout(() => {
      // Only generate previews for small image files (< 10 MB) to prevent browser decoder hangs
      if (file.type && file.type.startsWith('image/') && file.size < 10 * 1024 * 1024) {
        url = URL.createObjectURL(file.file);
        setLocalPreview(url);
      }
    }, 50); // Yield to main thread so UI renders instantly

    return () => {
      clearTimeout(timer);
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [file]);

  const isImage = localPreview !== null;
  
  const getIcon = () => {
    if (file.category === 'video') {
      return (
        <div className="w-full h-full bg-[#D4A574]/20 flex items-center justify-center rounded-lg text-[#D4A574]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        </div>
      );
    }
    if (file.category === 'audio') {
      return (
        <div className="w-full h-full bg-[#F43F5E]/20 flex items-center justify-center rounded-lg text-[#F43F5E]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
        </div>
      );
    }
    if (file.category === 'archive') {
      return (
        <div className="w-full h-full bg-[#D4A574]/20 flex items-center justify-center rounded-lg text-[#D4A574]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>
        </div>
      );
    }
    return (
      <div className="w-full h-full bg-[#5BA5A5]/20 flex items-center justify-center rounded-lg text-[#5BA5A5]">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
      </div>
    );
  };

  const getAccentColor = () => {
    if (isImage) return 'border-l-[#5BA5A5]';
    if (file.category === 'video') return 'border-l-[#D4A574]';
    if (file.category === 'audio') return 'border-l-[#F43F5E]';
    if (file.category === 'archive') return 'border-l-[#D4A574]';
    return 'border-l-[#5BA5A5]';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -10, height: 0, overflow: 'hidden' }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
      className={`group bg-white/[0.03] border border-white/[0.06] border-l-2 ${getAccentColor()} rounded-xl p-3 flex items-center gap-4 hover:bg-white/[0.05] hover:border-white/[0.1] transition-all`}
    >
      <div className="w-12 h-12 flex-shrink-0">
        {isImage ? (
          <img src={localPreview} alt={file.name} className="w-full h-full object-cover rounded-lg" />
        ) : (
          getIcon()
        )}
      </div>
      
      <div className="flex-grow min-w-0">
        <p className="text-sm text-[#F5F5F2] font-medium truncate">{file.name}</p>
        <p className="text-xs text-[#9CA3A2]">{formatFileSize ? formatFileSize(file.size) : `${Math.round(file.size / 1024)} KB`}</p>
      </div>

      <button 
        onClick={() => onRemove(file.id)}
        className="opacity-0 group-hover:opacity-100 p-1.5 bg-white/[0.05] rounded-md text-[#5C6462] hover:bg-red-500/20 hover:text-red-400 transition-colors focus:opacity-100 outline-none"
        aria-label={`Remove ${file.name}`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </motion.div>
  );
};

export default FileCard;
