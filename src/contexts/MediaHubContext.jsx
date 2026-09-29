import React, { createContext, useContext, useState, useCallback } from 'react';

const MediaHubContext = createContext(null);

export function MediaHubProvider({ children }) {
  const [media, setMedia] = useState([]);

  const addMedia = useCallback((newFiles) => {
    setMedia(prev => {
      // Deduplicate based on name, size, lastModified
      const existingKeys = new Set(prev.map(m => `${m.file.name}-${m.file.size}-${m.file.lastModified}`));
      const toAdd = [];
      
      for (const file of newFiles) {
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        if (!existingKeys.has(key)) {
          toAdd.push({
            id: Math.random().toString(36).substring(2, 11) + Date.now().toString(36),
            file,
            name: file.name,
            size: file.size,
            type: file.type || '',
            category: (file.type && file.type.startsWith('video/')) ? 'video' : 'image',
            addedAt: Date.now()
          });
          existingKeys.add(key);
        }
      }
      return [...toAdd, ...prev]; // newer files appear first
    });
  }, []);

  const removeMedia = useCallback((id) => {
    setMedia(prev => prev.filter(m => m.id !== id));
  }, []);

  const clearMedia = useCallback(() => {
    setMedia([]);
  }, []);

  return (
    <MediaHubContext.Provider value={{ media, addMedia, removeMedia, clearMedia }}>
      {children}
    </MediaHubContext.Provider>
  );
}

export function useMediaHub() {
  return useContext(MediaHubContext);
}
