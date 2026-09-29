import React, { useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMediaHub } from '../contexts/MediaHubContext';

export default function MediaPicker({ onAddSelectedToTransfer, onCancel }) {
  const { media, addMedia } = useMediaHub();
  const fileInputRef = useRef(null);
  
  const [filter, setFilter] = useState('all'); // all, photos, videos
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isPickerActive, setIsPickerActive] = useState(false);

  const filteredMedia = useMemo(() => {
    if (filter === 'photos') return media.filter(m => m.category === 'image');
    if (filter === 'videos') return media.filter(m => m.category === 'video');
    return media;
  }, [media, filter]);

  const handleFileInputChange = (e) => {
    setIsPickerActive(false);
    
    const t0 = performance.now();
    console.log(`[MEDIA HUB] change event received at ${t0.toFixed(1)}ms`);

    if (e.target.files && e.target.files.length > 0) {
      console.log(`[MEDIA HUB] FileList received (count: ${e.target.files.length})`);
      
      const t1 = performance.now();
      const filesArray = Array.from(e.target.files);
      const t2 = performance.now();
      console.log(`[MEDIA HUB] Array.from completed at ${t2.toFixed(1)}ms (took ${(t2 - t1).toFixed(1)}ms)`);
      
      addMedia(filesArray);
      
      const t3 = performance.now();
      console.log(`[MEDIA HUB] handler completed at ${t3.toFixed(1)}ms (total JS time: ${(t3 - t0).toFixed(1)}ms)`);
    }
    
    e.target.value = '';
  };

  const handleOpenNativePicker = () => {
    setIsPickerActive(true);
    if (fileInputRef.current) {
      console.log('[MEDIA HUB] native picker opened at', performance.now().toFixed(1) + 'ms');
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const toggleSelection = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleContinue = () => {
    const selectedFiles = media.filter(m => selectedIds.has(m.id)).map(m => m.file);
    if (selectedFiles.length > 0) {
      onAddSelectedToTransfer(selectedFiles);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="w-full max-w-2xl mx-auto flex flex-col h-[80vh] bg-gradient-to-b from-white/[0.04] to-white/[0.01] backdrop-blur-2xl border border-white/[0.08] rounded-[24px] shadow-2xl overflow-hidden relative"
    >
      <input 
        type="file" 
        multiple
        accept="image/*,video/*,video/mp4,video/quicktime,.mmov,.mov,.mp4,.m4v"
        className="hidden" 
        ref={fileInputRef}
        onChange={handleFileInputChange}
      />

      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-white/[0.06] flex items-center justify-between z-10 relative bg-black/20">
        <button onClick={onCancel} className="text-[#9CA3AF] hover:text-white px-2 py-1 rounded-lg transition">
          Cancel
        </button>
        <h2 className="text-lg font-semibold text-[#F3F4F6]">PARALLEL Media</h2>
        <button 
          onClick={handleOpenNativePicker} 
          disabled={isPickerActive}
          className="text-[#5BA5A5] font-medium px-2 py-1 hover:text-[#76C2C2] transition flex items-center gap-1 disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Add
        </button>
      </div>

      {/* Filters */}
      <div className="flex p-3 gap-2 justify-center border-b border-white/[0.03] bg-black/10">
        {['all', 'photos', 'videos'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition-colors ${filter === f ? 'bg-white/10 text-white' : 'text-[#6B7280] hover:text-[#9CA3AF] hover:bg-white/[0.05]'}`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Grid Area */}
      <div className="flex-grow overflow-y-auto p-4 custom-scrollbar">
        {media.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-70">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-[#6B7280] mb-4">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>
            </svg>
            <p className="text-[#9CA3AF] mb-1">Your local media library is empty.</p>
            <p className="text-xs text-[#6B7280]">Import photos and videos to quickly select them later.</p>
            <button 
              onClick={handleOpenNativePicker}
              className="mt-6 px-6 py-2 bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.1] rounded-xl text-sm font-medium transition-colors"
            >
              Add from Photos
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
            <AnimatePresence>
              {filteredMedia.map(m => {
                const isSelected = selectedIds.has(m.id);
                return (
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    key={m.id}
                    onClick={() => toggleSelection(m.id)}
                    className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${isSelected ? 'border-[#5BA5A5] scale-95' : 'border-transparent hover:border-white/[0.1]'}`}
                  >
                    {/* Fake Media Content (Safe) */}
                    <div className="w-full h-full bg-white/[0.04] flex flex-col items-center justify-center p-2 text-center">
                      {m.category === 'video' ? (
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#D4A574] mb-2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                      ) : (
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#5BA5A5] mb-2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                      )}
                      <span className="text-[10px] text-[#9CA3A2] truncate w-full px-1">{m.name}</span>
                    </div>

                    {/* Selection Overlay */}
                    {isSelected && (
                      <div className="absolute inset-0 bg-[#5BA5A5]/20 flex items-start justify-end p-2 pointer-events-none">
                        <div className="w-5 h-5 bg-[#5BA5A5] rounded-full flex items-center justify-center shadow-lg">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Footer Action */}
      <div className="p-4 border-t border-white/[0.06] bg-black/20 flex items-center justify-between">
        <div className="text-sm text-[#9CA3A2]">
          {selectedIds.size} selected
        </div>
        <button
          onClick={handleContinue}
          disabled={selectedIds.size === 0}
          className="px-6 py-2.5 bg-white text-black font-medium rounded-xl hover:bg-white/90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add to Transfer
        </button>
      </div>
    </motion.div>
  );
}
