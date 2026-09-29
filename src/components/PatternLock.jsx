import React, { useState, useRef, useEffect } from 'react';
import { normalizePattern, validatePattern } from '../lib/patternUtils';

const DOT_POSITIONS = [
  { id: 0, x: 40, y: 40 }, { id: 1, x: 120, y: 40 }, { id: 2, x: 200, y: 40 },
  { id: 3, x: 40, y: 120 }, { id: 4, x: 120, y: 120 }, { id: 5, x: 200, y: 120 },
  { id: 6, x: 40, y: 200 }, { id: 7, x: 120, y: 200 }, { id: 8, x: 200, y: 200 }
];

export default function PatternLock({
  pattern = [],
  onPatternComplete,
  mode = 'input',
  error = false,
  success = false,
  disabled = false
}) {
  const containerRef = useRef(null);
  const [currentPattern, setCurrentPattern] = useState(mode === 'display' ? pattern : []);
  const [isDrawing, setIsDrawing] = useState(false);
  const [pointerPos, setPointerPos] = useState(null);
  const [isShaking, setIsShaking] = useState(false);

  useEffect(() => {
    if (mode === 'display') {
      setCurrentPattern(pattern);
    }
  }, [pattern, mode]);

  useEffect(() => {
    if (error) {
      setIsShaking(true);
      const timer = setTimeout(() => {
        setIsShaking(false);
        if (mode === 'input') {
          setCurrentPattern([]);
        }
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [error, mode]);

  const getPointerCoords = (e) => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const getHitNode = (coords) => {
    if (!coords) return null;
    for (let i = 0; i < DOT_POSITIONS.length; i++) {
      const dot = DOT_POSITIONS[i];
      const dx = coords.x - dot.x;
      const dy = coords.y - dot.y;
      if (dx * dx + dy * dy < 30 * 30) {
        return dot.id;
      }
    }
    return null;
  };

  const handlePointerDown = (e) => {
    if (mode !== 'input' || disabled || error || success) return;
    
    e.target.setPointerCapture(e.pointerId);
    
    const coords = getPointerCoords(e);
    const hitNode = getHitNode(coords);
    
    setIsDrawing(true);
    if (hitNode !== null) {
      setCurrentPattern([hitNode]);
      setPointerPos(coords);
    } else {
      setCurrentPattern([]);
      setPointerPos(coords);
    }
  };

  const handlePointerMove = (e) => {
    if (!isDrawing || mode !== 'input' || disabled || error || success) return;
    
    const coords = getPointerCoords(e);
    setPointerPos(coords);
    
    const hitNode = getHitNode(coords);
    if (hitNode !== null && !currentPattern.includes(hitNode)) {
      setCurrentPattern(prev => [...prev, hitNode]);
    }
  };

  const handlePointerUp = (e) => {
    if (!isDrawing) return;
    setIsDrawing(false);
    setPointerPos(null);
    e.target.releasePointerCapture(e.pointerId);
    
    if (currentPattern.length > 0) {
      const normalized = normalizePattern(currentPattern);
      if (validatePattern(normalized)) {
        onPatternComplete?.(normalized);
      } else {
        // Reset silently if invalid (e.g., < 4 nodes)
        setCurrentPattern([]);
      }
    }
  };

  const getColor = () => {
    if (error) return '#F87171'; // red-400
    if (success) return '#10B981'; // emerald-500
    return '#5BA5A5'; // teal
  };

  const activeColor = getColor();

  return (
    <div
      ref={containerRef}
      className={`relative w-[240px] h-[240px] mx-auto select-none ${isShaking ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}
      style={{ touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }
      `}</style>
      
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {/* Lines between connected dots */}
        {currentPattern.map((nodeId, idx) => {
          if (idx === 0) return null;
          const prevNode = DOT_POSITIONS[currentPattern[idx - 1]];
          const currNode = DOT_POSITIONS[nodeId];
          return (
            <line
              key={`line-${idx}`}
              x1={prevNode.x}
              y1={prevNode.y}
              x2={currNode.x}
              y2={currNode.y}
              stroke={activeColor}
              strokeWidth="3"
              strokeLinecap="round"
              opacity="0.7"
              className="transition-colors duration-200"
            />
          );
        })}
        
        {/* Tracking line in input mode */}
        {isDrawing && currentPattern.length > 0 && pointerPos && (
          <line
            x1={DOT_POSITIONS[currentPattern[currentPattern.length - 1]].x}
            y1={DOT_POSITIONS[currentPattern[currentPattern.length - 1]].y}
            x2={pointerPos.x}
            y2={pointerPos.y}
            stroke={activeColor}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="6 6"
            opacity="0.3"
          />
        )}
      </svg>
      
      {/* Dots */}
      {DOT_POSITIONS.map(dot => {
        const isActive = currentPattern.includes(dot.id);
        
        return (
          <div
            key={dot.id}
            className="absolute rounded-full -translate-x-1/2 -translate-y-1/2 flex items-center justify-center transition-all duration-200"
            style={{
              left: dot.x,
              top: dot.y,
              width: 44,
              height: 44
            }}
          >
            <div
              className={`rounded-full transition-all duration-200 ${
                isActive 
                  ? 'w-5 h-5' 
                  : 'w-3 h-3 bg-white/[0.15] border border-white/[0.1]'
              }`}
              style={{
                backgroundColor: isActive ? activeColor : undefined,
                boxShadow: isActive && !error && !success ? '0 0 12px rgba(91,165,165,0.6)' : 
                          isActive && success ? '0 0 12px rgba(16,185,129,0.6)' : 
                          isActive && error ? '0 0 12px rgba(248,113,113,0.6)' : 'none',
                transform: isActive && success ? 'scale(1.2)' : 'scale(1)'
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
