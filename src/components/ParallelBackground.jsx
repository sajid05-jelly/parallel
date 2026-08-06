import React, { useEffect, useRef } from 'react';

const ParallelBackground = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    
    let animationFrameId;
    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    const particles = [];
    const particleCount = prefersReducedMotion ? 0 : 35;
    
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 1.5 + 0.5,
        speedX: (Math.random() - 0.5) * 0.1,
        speedY: (Math.random() - 0.5) * 0.1,
        isWarm: Math.random() > 0.5,
        opacity: Math.random() * 0.3 + 0.1
      });
    }

    let time = 0;

    const render = () => {
      // Background base
      ctx.fillStyle = '#090A0A';
      ctx.fillRect(0, 0, width, height);
      
      const cx = width / 2;
      const cy = height / 2;
      
      // Breathing factor for positions
      const breath = Math.sin(time * 0.0005) * 50;

      // Warm gradient (Left)
      const warmX = width * 0.2 + breath;
      const warmY = height * 0.5;
      const warmGradient = ctx.createRadialGradient(warmX, warmY, 0, warmX, warmY, width * 0.8);
      warmGradient.addColorStop(0, 'rgba(212, 165, 116, 0.15)');
      warmGradient.addColorStop(1, 'rgba(212, 165, 116, 0)');
      ctx.fillStyle = warmGradient;
      ctx.fillRect(0, 0, width, height);

      // Cool gradient (Right)
      const coolX = width * 0.8 - breath;
      const coolY = height * 0.5;
      const coolGradient = ctx.createRadialGradient(coolX, coolY, 0, coolX, coolY, width * 0.8);
      coolGradient.addColorStop(0, 'rgba(91, 165, 165, 0.12)');
      coolGradient.addColorStop(1, 'rgba(91, 165, 165, 0)');
      ctx.fillStyle = coolGradient;
      ctx.fillRect(0, 0, width, height);

      // Center convergence
      const centerGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, height * 0.6);
      centerGradient.addColorStop(0, 'rgba(156, 163, 162, 0.05)');
      centerGradient.addColorStop(1, 'rgba(156, 163, 162, 0)');
      ctx.fillStyle = centerGradient;
      ctx.fillRect(0, 0, width, height);
      
      // Subtle concentric portal rings at center
      const ringsBreath = Math.sin(time * 0.001) * 10;
      ctx.lineWidth = 1;
      
      ctx.beginPath();
      ctx.arc(cx, cy, 100 + ringsBreath, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, 200 + ringsBreath * 1.5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.015)';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, 350 + ringsBreath * 2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.01)';
      ctx.stroke();

      // Particles
      if (!prefersReducedMotion) {
        particles.forEach(p => {
          p.x += p.speedX;
          p.y += p.speedY;

          if (p.x < 0) p.x = width;
          if (p.x > width) p.x = 0;
          if (p.y < 0) p.y = height;
          if (p.y > height) p.y = 0;

          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fillStyle = p.isWarm 
            ? `rgba(212, 165, 116, ${p.opacity})` 
            : `rgba(91, 165, 165, ${p.opacity})`;
          ctx.fill();
        });
      }

      // Add simple noise effect statically with fixed pattern if desired, or skip for performance
      
      time += 16;
      animationFrameId = requestAnimationFrame(render);
    };
    
    render();

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="fixed inset-0 pointer-events-none"
      aria-hidden="true"
    />
  );
};

export default ParallelBackground;
