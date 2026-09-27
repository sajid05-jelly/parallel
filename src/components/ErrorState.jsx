import React from 'react';
import GlassCard from './GlassCard';

const getErrorDetails = (type, customMessage, customDescription, customActionLabel) => {
  const defaults = {
    'expired': {
      message: 'This portal no longer exists.',
      description: 'The link has expired or the sender closed the portal.',
      actionLabel: null,
      icon: <svg className="w-8 h-8 text-[#D4A574]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    },
    'already_connected': {
      message: 'This portal is already connected.',
      description: 'Someone is already receiving files from this portal.',
      actionLabel: null,
      icon: <svg className="w-8 h-8 text-[#5BA5A5]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
    },
    'network': {
      message: 'Connection interrupted',
      description: 'We lost connection to the portal. Check your internet.',
      actionLabel: 'Try again',
      icon: <svg className="w-8 h-8 text-[#D4A574]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0119 12.55"/><path d="M5 12.55a10.94 10.94 0 015.17-2.39"/><path d="M10.71 5.05A16 16 0 0122.58 9"/><path d="M1.42 9a15.91 15.91 0 014.7-2.88"/><path d="M8.53 16.11a6 6 0 016.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
    },
    'upload_failed': {
      message: 'Connection failed',
      description: 'The connection between the devices was interrupted.',
      actionLabel: 'Retry',
      icon: <svg className="w-8 h-8 text-[#D4A574]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    },
    'file_too_large': {
      message: 'Files are too large',
      description: 'The selected files exceed the size limit.',
      actionLabel: null,
      icon: <svg className="w-8 h-8 text-[#D4A574]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
    },
    'transfer_failed': {
      message: 'Transfer failed',
      description: 'An error occurred during the transfer process.',
      actionLabel: 'Start over',
      icon: <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
    },
    'generic': {
      message: 'An error occurred',
      description: 'Something went wrong.',
      actionLabel: 'Try again',
      icon: <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    }
  };

  const details = defaults[type] || defaults['generic'];
  
  return {
    message: customMessage || details.message,
    description: customDescription || details.description,
    actionLabel: customActionLabel || details.actionLabel,
    icon: details.icon
  };
};

const ErrorState = ({ type = 'generic', message, description, onAction, actionLabel }) => {
  const details = getErrorDetails(type, message, description, actionLabel);

  return (
    <div className="w-full max-w-sm mx-auto">
      <GlassCard className="flex flex-col items-center text-center p-8">
        <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-6 shadow-sm">
          {details.icon}
        </div>
        
        <h3 className="text-xl font-medium text-[#F5F5F2] mb-2">
          {details.message}
        </h3>
        
        <p className="text-[#9CA3A2] text-sm mb-6">
          {details.description}
        </p>
        
        {details.actionLabel && onAction && (
          <button
            onClick={onAction}
            className="px-6 py-3 rounded-xl bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.1] hover:border-white/[0.15] text-[#F5F5F2] text-sm font-medium transition-colors w-full mb-3"
          >
            {details.actionLabel}
          </button>
        )}

        <button
          onClick={() => window.location.href = '/'}
          className="px-6 py-2 rounded-xl text-[#6B7280] hover:text-[#F5F5F2] text-sm font-medium transition-colors w-full"
        >
          Go Home
        </button>
      </GlassCard>
    </div>
  );
};

export default ErrorState;
