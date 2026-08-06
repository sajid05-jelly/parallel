import { useEffect, useState } from 'react';
import SenderPage from './pages/SenderPage';
import ReceiverPage from './pages/ReceiverPage';

function getRoute() {
  const path = window.location.pathname;
  const hash = window.location.hash;
  
  const receiveMatch = path.match(/^\/receive\/([a-zA-Z0-9_-]+)$/);
  if (receiveMatch) {
    const token = receiveMatch[1];
    const keyMatch = hash.match(/^#key=([a-zA-Z0-9_-]+)$/);
    const keyString = keyMatch ? keyMatch[1] : null;
    return { page: 'receive', token, keyString };
  }
  
  return { page: 'sender' };
}

function App() {
  const [route, setRoute] = useState(getRoute());

  useEffect(() => {
    const handlePopState = () => setRoute(getRoute());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return (
    <div className="min-h-screen bg-background text-primary font-sans antialiased selection:bg-accent/30 selection:text-white">
      {route.page === 'receive' ? (
        <ReceiverPage token={route.token} keyString={route.keyString} />
      ) : (
        <SenderPage />
      )}
    </div>
  );
}

export default App;
