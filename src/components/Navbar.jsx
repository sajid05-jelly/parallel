import React, { useState, useEffect } from 'react';

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 h-16 flex items-center ${
      scrolled ? 'bg-[#030407]/60 backdrop-blur-2xl border-b border-white/[0.08] shadow-[0_4px_30px_rgba(0,0,0,0.4)]' : 'bg-transparent border-b border-transparent'
    }`}>
      <div className="w-full px-6 sm:px-10 md:px-14 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2.5 group">
          {/* Minimalist Professional Logo Mark */}
          <div className="relative flex items-center justify-center transition-all duration-300 group-hover:drop-shadow-[0_0_8px_rgba(91,165,165,0.4)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="8" cy="12" r="6" stroke="#D4A574" strokeWidth="2.2" strokeOpacity="0.9"/>
              <circle cx="16" cy="12" r="6" stroke="#5BA5A5" strokeWidth="2.2" strokeOpacity="0.9"/>
            </svg>
          </div>
          
          <span className="font-space text-sm font-bold tracking-[0.22em] text-[#F5F5F2] uppercase group-hover:text-[#5BA5A5] transition-all duration-300 group-hover:[text-shadow:0_0_8px_rgba(91,165,165,0.3)]">
            PARALLEL
          </span>
        </a>

        <div className="hidden md:flex items-center">
          <span className="px-3 py-1 rounded-full border border-white/[0.08] bg-white/[0.02] text-[11px] font-medium text-[#9CA3A2] flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#5BA5A5]"></span>
            Zero Cloud Storage
          </span>
        </div>
      </div>
    </nav>


  );
};

export default Navbar;
