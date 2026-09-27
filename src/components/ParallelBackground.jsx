import React, { useEffect, useRef } from 'react';

const ParallelBackground = () => {
  const containerRef = useRef(null);

  useEffect(() => {
    const isDesktop = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!isDesktop) return;

    let rafId;
    const handleMouseMove = (e) => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.style.setProperty('--mouse-x', `${e.clientX}px`);
          containerRef.current.style.setProperty('--mouse-y', `${e.clientY}px`);
        }
      });
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div ref={containerRef} className="fixed inset-0 pointer-events-none -z-10 bg-[#050607] overflow-hidden">
      
      {/* Film grain / noise texture */}
      <div 
        className="absolute inset-0 opacity-[0.018] mix-blend-overlay" 
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.8%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}
      ></div>

      {/* Ambient nebulae — very subtle depth */}
      <div className="absolute -top-[25%] -right-[15%] w-[65%] h-[65%] rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#0D2E33]/25 via-[#081A1E]/8 to-transparent blur-[120px]"></div>
      
      <div className="absolute -bottom-[25%] -left-[15%] w-[65%] h-[65%] rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#1E0E2A]/20 via-[#120820]/6 to-transparent blur-[120px]"></div>

      <div className="absolute top-[25%] left-[25%] w-[35%] h-[35%] rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#2A1A0A]/12 via-transparent to-transparent blur-[130px]"></div>

      {/* Cosmic dust / star field */}
      <svg className="absolute inset-0 w-full h-full opacity-20">
        <pattern id="star-pattern" x="0" y="0" width="150" height="150" patternUnits="userSpaceOnUse">
          <circle cx="15" cy="15" r="0.8" fill="#ffffff" opacity="0.4" />
          <circle cx="55" cy="95" r="0.6" fill="#D4A574" opacity="0.35" />
          <circle cx="110" cy="40" r="0.7" fill="#5BA5A5" opacity="0.4" />
          <circle cx="80" cy="120" r="1" fill="#ffffff" opacity="0.12" filter="blur(0.5px)" />
          <circle cx="130" cy="80" r="0.5" fill="#ffffff" opacity="0.25" />
          <circle cx="25" cy="70" r="0.4" fill="#9C6BCA" opacity="0.3" />
        </pattern>
        <rect x="0" y="0" width="100%" height="100%" fill="url(#star-pattern)"></rect>
      </svg>

      {/* Orbital rings — PARALLEL identity */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full min-w-[1200px] min-h-[1200px] flex justify-center items-center opacity-50">
        <svg viewBox="0 0 1000 1000" className="w-[140%] h-[140%] animate-spin-slow" style={{ transformOrigin: 'center' }}>
          <defs>
            <linearGradient id="ring1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#5BA5A5" stopOpacity="0" />
              <stop offset="25%" stopColor="#5BA5A5" stopOpacity="0.35" />
              <stop offset="75%" stopColor="#5BA5A5" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#D4A574" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="ring2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#D4A574" stopOpacity="0" />
              <stop offset="35%" stopColor="#D4A574" stopOpacity="0.3" />
              <stop offset="65%" stopColor="#5BA5A5" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#5BA5A5" stopOpacity="0" />
            </linearGradient>
          </defs>
          
          {/* Ellipse A */}
          <ellipse cx="500" cy="500" rx="420" ry="140" stroke="url(#ring1)" strokeWidth="0.8" fill="none" transform="rotate(35 500 500)" />
          
          {/* Ellipse B */}
          <ellipse cx="500" cy="500" rx="460" ry="160" stroke="url(#ring2)" strokeWidth="0.8" fill="none" transform="rotate(-45 500 500)" />
          
          {/* Faint outer orbit */}
          <circle cx="500" cy="500" r="480" stroke="#ffffff" strokeOpacity="0.02" strokeWidth="0.5" fill="none" />
        </svg>
      </div>

      {/* Interactive glow layer — desktop mouse tracking */}
      <div 
        className="hidden md:block absolute inset-0 pointer-events-none"
        style={{
          maskImage: 'radial-gradient(circle 300px at var(--mouse-x, -1000px) var(--mouse-y, -1000px), black 0%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(circle 300px at var(--mouse-x, -1000px) var(--mouse-y, -1000px), black 0%, transparent 100%)'
        }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full min-w-[1200px] min-h-[1200px] flex justify-center items-center opacity-100 transition-opacity duration-300">
          <svg viewBox="0 0 1000 1000" className="w-[140%] h-[140%] animate-spin-slow" style={{ transformOrigin: 'center' }}>
            <defs>
              <linearGradient id="ring1-glow" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#5BA5A5" stopOpacity="0" />
                <stop offset="30%" stopColor="#5BA5A5" stopOpacity="0.8" />
                <stop offset="70%" stopColor="#5BA5A5" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#D4A574" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="ring2-glow" x1="100%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#D4A574" stopOpacity="0" />
                <stop offset="40%" stopColor="#D4A574" stopOpacity="0.8" />
                <stop offset="60%" stopColor="#D4A574" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#5BA5A5" stopOpacity="0" />
              </linearGradient>
            </defs>
            
            {/* Glowing Ellipse A */}
            <ellipse cx="500" cy="500" rx="420" ry="140" stroke="url(#ring1-glow)" strokeWidth="1.5" fill="none" transform="rotate(35 500 500)" />
            <ellipse cx="500" cy="500" rx="420" ry="140" stroke="url(#ring1-glow)" strokeWidth="6" filter="blur(4px)" opacity="0.5" fill="none" transform="rotate(35 500 500)" />
            
            {/* Glowing Ellipse B */}
            <ellipse cx="500" cy="500" rx="460" ry="160" stroke="url(#ring2-glow)" strokeWidth="1.5" fill="none" transform="rotate(-45 500 500)" />
            <ellipse cx="500" cy="500" rx="460" ry="160" stroke="url(#ring2-glow)" strokeWidth="6" filter="blur(4px)" opacity="0.5" fill="none" transform="rotate(-45 500 500)" />
          </svg>
        </div>
      </div>

    </div>
  );
};

export default ParallelBackground;
