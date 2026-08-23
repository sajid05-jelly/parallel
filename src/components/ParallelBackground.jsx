import React from 'react';

const ParallelBackground = () => {
  return (
    <div className="fixed inset-0 pointer-events-none -z-10 bg-[#030407] overflow-hidden">
      
      {/* Subtle noise texture for a premium cinematic feel */}
      <div 
        className="absolute inset-0 opacity-[0.025] mix-blend-overlay" 
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.8%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}
      ></div>

      {/* Deep Cosmic Nebulae - Dimensional Depth */}
      <div className="absolute -top-[20%] -right-[10%] w-[70%] h-[70%] rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#113A40]/30 via-[#0A2226]/10 to-transparent blur-[100px]"></div>
      
      <div className="absolute -bottom-[20%] -left-[10%] w-[70%] h-[70%] rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#2D1640]/30 via-[#180B24]/10 to-transparent blur-[100px]"></div>

      <div className="absolute top-[20%] left-[20%] w-[40%] h-[40%] rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#402A16]/20 via-transparent to-transparent blur-[120px]"></div>

      {/* Tiny Cosmic Dust / Stars */}
      <svg className="absolute inset-0 w-full h-full opacity-30">
        <pattern id="star-pattern" x="0" y="0" width="120" height="120" patternUnits="userSpaceOnUse">
          <circle cx="12" cy="12" r="1.5" fill="#ffffff" opacity="0.3" filter="blur(0.5px)" />
          <circle cx="45" cy="85" r="1" fill="#D4A574" opacity="0.4" />
          <circle cx="95" cy="35" r="1" fill="#5BA5A5" opacity="0.5" />
          <circle cx="70" cy="90" r="2" fill="#ffffff" opacity="0.15" filter="blur(1px)" />
          <circle cx="10" cy="60" r="0.5" fill="#9C6BCA" opacity="0.6" />
          <circle cx="85" cy="110" r="1" fill="#ffffff" opacity="0.2" />
        </pattern>
        <rect x="0" y="0" width="100%" height="100%" fill="url(#star-pattern)"></rect>
      </svg>

      {/* Dimensional Rings / Intersecting Parallel Planes */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full min-w-[1200px] min-h-[1200px] flex justify-center items-center opacity-60">
        <svg viewBox="0 0 1000 1000" className="w-[140%] h-[140%] animate-[spin_180s_linear_infinite]" style={{ transformOrigin: 'center' }}>
          <defs>
            <linearGradient id="ring1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#5BA5A5" stopOpacity="0" />
              <stop offset="30%" stopColor="#5BA5A5" stopOpacity="0.5" />
              <stop offset="70%" stopColor="#9C6BCA" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#D4A574" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="ring2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#9C6BCA" stopOpacity="0" />
              <stop offset="40%" stopColor="#D4A574" stopOpacity="0.4" />
              <stop offset="60%" stopColor="#5BA5A5" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#5BA5A5" stopOpacity="0" />
            </linearGradient>
          </defs>
          
          {/* Ellipse 1 (Parallel Plane A) */}
          <ellipse cx="500" cy="500" rx="420" ry="140" stroke="url(#ring1)" strokeWidth="1" fill="none" transform="rotate(35 500 500)" />
          
          {/* Ellipse 2 (Parallel Plane B) */}
          <ellipse cx="500" cy="500" rx="460" ry="160" stroke="url(#ring2)" strokeWidth="1" fill="none" transform="rotate(-45 500 500)" />
          
          {/* Very faint huge outer orbit linking them */}
          <circle cx="500" cy="500" r="480" stroke="#ffffff" strokeOpacity="0.03" strokeWidth="1" fill="none" />
        </svg>
      </div>

    </div>
  );
};

export default ParallelBackground;
