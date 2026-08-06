import { useState, useEffect } from 'react';

export default function useCountdown(targetDate) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!targetDate) {
      setRemaining(0);
      return;
    }

    const calculateRemaining = () => {
      const targetTime = targetDate instanceof Date ? targetDate.getTime() : new Date(targetDate).getTime();
      return Math.max(0, Math.floor((targetTime - Date.now()) / 1000));
    };

    setRemaining(calculateRemaining());

    const intervalId = setInterval(() => {
      const r = calculateRemaining();
      setRemaining(r);
      if (r <= 0) {
        clearInterval(intervalId);
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [targetDate]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const isExpired = remaining <= 0;
  const formatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  return { remaining, minutes, seconds, isExpired, formatted };
}
