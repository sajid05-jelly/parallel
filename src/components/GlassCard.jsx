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
  // Use a solid dark color with a very subtle border and shadow for a premium SaaS look.
  const baseStyle = "bg-[#0C0D0E]/80 backdrop-blur-md border border-[#ffffff0a] rounded-[24px] shadow-sm";
  
  let glowClass = "";
  if (glow) {
    if (glowColor === 'warm') glowClass = "shadow-[0_0_40px_rgba(212,165,116,0.05)] border-[#D4A574]/20";
    else if (glowColor === 'cool') glowClass = "shadow-[0_0_40px_rgba(91,165,165,0.05)] border-[#5BA5A5]/20";
    else glowClass = "shadow-[0_0_40px_rgba(255,255,255,0.03)] border-white/10";
  }

  const hoverStyle = hover 
    ? "hover:bg-[#121315]/90 hover:border-[#ffffff15] transition-all duration-300 cursor-pointer" 
    : "";

  const classes = `${baseStyle} ${glowClass} ${hoverStyle} ${padding} ${className}`;

  if (hover) {
    return (
      <motion.div 
        whileHover={{ y: -2 }}
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
