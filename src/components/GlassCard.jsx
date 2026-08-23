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
  // Premium crystal/glass look with top inner border reflection
  const baseStyle = "bg-gradient-to-b from-white/[0.04] to-white/[0.01] backdrop-blur-xl border border-white/[0.08] rounded-[24px] shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)] relative overflow-hidden";
  
  let glowClass = "";
  if (glow) {
    if (glowColor === 'warm') glowClass = "shadow-[0_0_40px_rgba(212,165,116,0.08),inset_0_1px_0_rgba(255,255,255,0.08)] border-[#D4A574]/30";
    else if (glowColor === 'cool') glowClass = "shadow-[0_0_40px_rgba(91,165,165,0.08),inset_0_1px_0_rgba(255,255,255,0.08)] border-[#5BA5A5]/30";
    else glowClass = "shadow-[0_0_40px_rgba(156,107,202,0.08),inset_0_1px_0_rgba(255,255,255,0.08)] border-[#9C6BCA]/30";
  }

  const hoverStyle = hover 
    ? "hover:from-white/[0.06] hover:to-white/[0.02] hover:border-white/[0.15] transition-all duration-300 cursor-pointer" 
    : "";

  const classes = `${baseStyle} ${glowClass} ${hoverStyle} ${padding} ${className}`;

  if (hover) {
    return (
      <motion.div 
        whileHover={{ y: -2 }}
        className={classes}
      >
        {/* Subtle inner light sweep for crystal effect on hover */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.05] to-transparent opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
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
