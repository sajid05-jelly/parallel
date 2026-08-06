import React from 'react';
import GlassCard from './GlassCard';

const getErrorDetails = (type, customMessage, customDescription, customActionLabel) => {
  const defaults = {
    'expired': {
      message: 'This portal no longer exists.',
      description: 'The link has expired or the sender closed the portal.',
      actionLabel: null,
      icon: '⏳'
    },
    'already_connected': {
      message: 'This portal is already connected.',
      description: 'Someone is already receiving files from this portal.',
      actionLabel: null,
      icon: '🔒'
    },
    'network': {
      message: 'Connection interrupted',
      description: 'We lost connection to the portal. Check your internet.',
      actionLabel: 'Try again',
      icon: '📡'
    },
    'upload_failed': {
      message: 'Upload failed',
      description: 'There was a problem uploading your files.',
      actionLabel: 'Retry',
      icon: '⚠️'
    },
    'file_too_large': {
      message: 'Files are too large',
      description: 'The selected files exceed the size limit.',
      actionLabel: null,
      icon: '📦'
    },
    'transfer_failed': {
      message: 'Transfer failed',
      description: 'An error occurred during the transfer process.',
      actionLabel: 'Start over',
      icon: '❌'
    },
    'generic': {
      message: 'An error occurred',
      description: 'Something went wrong.',
      actionLabel: 'Try again',
      icon: '🛑'
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
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-3xl mb-6">
          {details.icon}
        </div>
        
        <h3 className="text-xl font-medium text-white mb-2">
          {details.message}
        </h3>
        
        <p className="text-gray-400 text-sm mb-6">
          {details.description}
        </p>
        
        {details.actionLabel && onAction && (
          <button
            onClick={onAction}
            className="px-6 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors w-full"
          >
            {details.actionLabel}
          </button>
        )}
      </GlassCard>
    </div>
  );
};

export default ErrorState;
