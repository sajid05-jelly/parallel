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
    <nav className={`fixed top-0 left-0 right-0 z-50 h-14 transition-all duration-300 ${
      scrolled ? 'bg-[#090A0A]/70 backdrop-blur-xl border-b border-white/[0.04]' : 'bg-transparent'
    }`}>
      <div className="max-w-6xl mx-auto px-4 h-full flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Portal Mark SVG */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="9" cy="12" r="7" stroke="#D4A574" strokeWidth="2" strokeOpacity="0.8"/>
            <circle cx="15" cy="12" r="7" stroke="#5BA5A5" strokeWidth="2" strokeOpacity="0.8"/>
          </svg>
          <span className="text-sm font-semibold tracking-[0.25em] uppercase text-[#F5F5F2]">
            PARALLEL
          </span>
        </div>

        <div className="hidden md:flex items-center gap-8">
          <a href="#" className="text-[13px] text-[#9CA3A2] hover:text-[#F5F5F2] transition-colors">How it works</a>
          <a href="#" className="text-[13px] text-[#9CA3A2] hover:text-[#F5F5F2] transition-colors">Security</a>
          <a href="#" className="text-[13px] text-[#9CA3A2] hover:text-[#F5F5F2] transition-colors">About</a>
        </div>

        <div className="md:hidden flex items-center">
          <button className="text-[#9CA3A2] hover:text-[#F5F5F2]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
