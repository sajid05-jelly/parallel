import { useEffect, useState } from 'react';
import SenderPage from './pages/SenderPage';
import ReceiverPage from './pages/ReceiverPage';
import { ToastProvider } from './components/Toast';

function getRoute() {
  const path = window.location.pathname;
  const hash = window.location.hash;
  
  // /receive/TOKEN#key=KEYSTRING → receiver with direct link
  const receiveMatch = path.match(/^\/receive\/([a-zA-Z0-9_-]+)$/);
  if (receiveMatch) {
    const token = receiveMatch[1];
    const keyMatch = hash.match(/^#key=([a-zA-Z0-9_-]+)$/);
    const keyString = keyMatch ? keyMatch[1] : null;
    return { page: 'receive', token, keyString };
  }

  // /receive → receiver landing (pattern / link entry)
  if (path === '/receive' || path === '/receive/') {
    return { page: 'receive', token: null, keyString: null };
  }
  
  return { page: 'sender' };
}

import { MediaHubProvider } from './contexts/MediaHubContext';

function App() {
  const [route, setRoute] = useState(getRoute());

  useEffect(() => {
    const handlePopState = () => setRoute(getRoute());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return (
    <ToastProvider>
      <MediaHubProvider>
        <div className="min-h-screen text-[#F5F5F2] font-sans antialiased selection:bg-[#5BA5A5]/30 selection:text-white">
          {route.page === 'receive' ? (
            <ReceiverPage token={route.token} keyString={route.keyString} />
          ) : (
            <SenderPage />
          )}
        </div>
      </MediaHubProvider>
    </ToastProvider>
  );
}

export default App;
