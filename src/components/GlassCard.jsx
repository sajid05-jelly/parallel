import React from 'react';
import { motion } from 'framer-motion';

const GlassCard = ({ 
  children, 
  className = '', 
  padding = 'p-6 md:p-8',
  hover = false,
  glow = false,
  glowColor = 'neutral'
}) => {
  const baseStyle = "bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-[22px]";
  
  let glowClass = "shadow-[0_8px_32px_rgba(0,0,0,0.3)]";
  if (glow) {
    if (glowColor === 'warm') glowClass = "shadow-[0_0_60px_rgba(212,165,116,0.06)]";
    else if (glowColor === 'cool') glowClass = "shadow-[0_0_60px_rgba(91,165,165,0.06)]";
    else glowClass = "shadow-[0_0_60px_rgba(255,255,255,0.03)]";
  }

  const hoverStyle = hover 
    ? "hover:bg-white/[0.06] hover:border-white/[0.12] transition-all duration-300 cursor-pointer" 
    : "";

  const classes = `${baseStyle} ${glowClass} ${hoverStyle} ${padding} ${className}`;

  if (hover) {
    return (
      <motion.div 
        whileHover={{ scale: 1.003 }}
        className={classes}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <div className={classes}>
      {children}
    </div>
  );
};

export default GlassCard;
