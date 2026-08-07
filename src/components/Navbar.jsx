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
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
      scrolled ? 'py-3 bg-[#090A0A]/80 backdrop-blur-2xl border-b border-white/[0.06] shadow-[0_10px_30px_rgba(0,0,0,0.8)]' : 'py-5 bg-transparent'
    }`}>
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        <a href="/" className="flex items-center gap-3 group">
          {/* Custom Dual-Orb Infinity Portal Mark */}
          <div className="relative w-7 h-7 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[#D4A574]/30 to-[#5BA5A5]/30 blur-md group-hover:scale-125 transition-transform duration-500"></div>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="relative z-10 transform group-hover:rotate-180 transition-transform duration-700">
              <circle cx="8.5" cy="12" r="6.5" stroke="url(#logo_grad1)" strokeWidth="2.2"/>
              <circle cx="15.5" cy="12" r="6.5" stroke="url(#logo_grad2)" strokeWidth="2.2"/>
              <defs>
                <linearGradient id="logo_grad1" x1="2" y1="5.5" x2="15" y2="18.5" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#D4A574"/>
                  <stop offset="1" stopColor="#C4897A"/>
                </linearGradient>
                <linearGradient id="logo_grad2" x1="9" y1="5.5" x2="22" y2="18.5" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#5BA5A5"/>
                  <stop offset="1" stopColor="#5B8DB8"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          
          <div className="flex flex-col">
            <span className="font-syne text-lg font-extrabold tracking-[0.2em] text-[#F5F5F2] uppercase leading-none group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-[#D4A574] group-hover:to-[#5BA5A5] transition-all">
              PARALLEL
            </span>
            <span className="text-[9px] tracking-[0.3em] text-[#5C6462] font-mono uppercase mt-0.5">P2P PROTOCOL</span>
          </div>
        </a>

        <div className="hidden md:flex items-center gap-10">
          <a href="#" className="text-xs font-medium text-[#9CA3A2] hover:text-[#F5F5F2] tracking-wider uppercase transition-colors">How it works</a>
          <a href="#" className="text-xs font-medium text-[#9CA3A2] hover:text-[#F5F5F2] tracking-wider uppercase transition-colors">Security</a>
          <a href="#" className="text-xs font-medium text-[#9CA3A2] hover:text-[#F5F5F2] tracking-wider uppercase transition-colors">About</a>
        </div>

        <div className="hidden md:flex items-center">
          <span className="px-3.5 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.02] text-[11px] font-mono text-[#9CA3A2] flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            ZERO CLOUD STORAGE
          </span>
        </div>

        <div className="md:hidden flex items-center">
          <button className="text-[#9CA3A2] hover:text-[#F5F5F2] p-2">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
    </nav>

  );
};

export default Navbar;
