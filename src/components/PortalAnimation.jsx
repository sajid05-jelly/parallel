import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const PortalAnimation = ({ stage = 'closed', progress = 0 }) => {
  if (stage === 'closed') return null;

  const isOpening = stage === 'opening';
  const isOpen = stage === 'open';

  return (
    <div className="relative flex items-center justify-center w-[150px] h-[150px] md:w-[200px] md:h-[200px] mx-auto">
      {/* Background glow */}
      <div className={`absolute inset-0 rounded-full bg-indigo-500/10 blur-xl transition-opacity duration-1000 ${isOpen ? 'opacity-100' : 'opacity-0'}`}></div>

      <AnimatePresence>
        {(isOpening || isOpen) && (
          <>
            {/* Outer Ring */}
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ 
                scale: isOpen ? 1.1 : 1, 
                opacity: isOpen ? 0.3 : 0.8,
                rotate: 360
              }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ 
                scale: { duration: 1.5, ease: 'easeOut' },
                opacity: { duration: 1.5 },
                rotate: { duration: 20, repeat: Infinity, ease: 'linear' }
              }}
              className="absolute inset-0 rounded-full border-[1px] border-dashed border-blue-500/50"
            />
            
            {/* Middle Ring */}
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ 
                scale: isOpen ? 1 : 0.8, 
                opacity: isOpen ? 0.5 : 1,
                rotate: -360
              }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ 
                scale: { duration: 1.2, ease: 'easeOut', delay: 0.2 },
                opacity: { duration: 1.2, delay: 0.2 },
                rotate: { duration: 15, repeat: Infinity, ease: 'linear' }
              }}
              className="absolute inset-4 rounded-full border-2 border-indigo-500/60"
            />

            {/* Inner Ring */}
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ 
                scale: isOpen ? 0.9 : 0.6, 
                opacity: isOpen ? 0.8 : 1,
              }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ 
                scale: { duration: 1, ease: 'easeOut', delay: 0.4 },
                opacity: { duration: 1, delay: 0.4 },
              }}
              className="absolute inset-8 rounded-full border-4 border-violet-500 shadow-[0_0_30px_rgba(139,92,246,0.5)]"
            />
            
            {/* Center Core */}
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ 
                scale: isOpen ? [0.9, 1.1, 0.9] : 0.4, 
                opacity: 1 
              }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ 
                scale: isOpen ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.8, delay: 0.6 }
              }}
              className="absolute inset-12 rounded-full bg-gradient-to-tr from-violet-500 to-blue-500 blur-sm"
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PortalAnimation;
