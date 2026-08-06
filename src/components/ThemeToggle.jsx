import React from 'react';
import { motion } from 'framer-motion';
import useTheme from '../hooks/useTheme';

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className="p-2 rounded-full bg-white/[0.05] hover:bg-white/[0.1] transition-colors flex items-center justify-center border border-white/[0.05]"
    >
      <motion.div
        initial={false}
        animate={{ rotate: isDark ? 0 : 180 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
      >
        {isDark ? '☀' : '🌙'}
      </motion.div>
    </button>
  );
};

export default ThemeToggle;
