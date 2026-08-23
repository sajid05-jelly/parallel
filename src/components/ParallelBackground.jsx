import React from 'react';

const ParallelBackground = () => {
  return (
    <div className="fixed inset-0 pointer-events-none -z-10 bg-[#040405] overflow-hidden">
      {/* Base Noise Texture for premium feel */}
      <div 
        className="absolute inset-0 opacity-[0.015]" 
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}
      ></div>

      {/* Subtle Top Gradient */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#D4A574]/[0.03] via-[#D4A574]/[0.005] to-transparent blur-[120px]"></div>

      {/* Subtle Bottom Gradient */}
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#5BA5A5]/[0.03] via-[#5BA5A5]/[0.005] to-transparent blur-[120px]"></div>

      {/* Very faint center highlight */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] rounded-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/[0.015] to-transparent blur-[100px]"></div>
    </div>
  );
};

export default ParallelBackground;
