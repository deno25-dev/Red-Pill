
import React, { useEffect, useState } from 'react';

export const SplashController: React.FC = () => {
  const [status, setStatus] = useState('Initializing secure environment...');

  useEffect(() => {
    // Simulate progression of status messages for better UX during load
    const timers = [
      setTimeout(() => setStatus('Loading local preferences...'), 800),
      setTimeout(() => setStatus('Connecting to secure storage...'), 1800),
      setTimeout(() => setStatus('Indexing database files...'), 2800),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] bg-[#0b0e11] flex flex-col items-center justify-center select-none cursor-wait">
      
      {/* Logo Container */}
      <div className="relative mb-8 flex flex-col items-center justify-center">
          <div className="relative animate-in fade-in zoom-in-95 duration-[1200ms] ease-out">
              {/* Glow effect behind logo */}
              <div className="absolute inset-0 bg-blue-500/20 blur-[60px] rounded-full animate-pulse"></div>
              <img 
                  src="https://i.postimg.cc/SK0PR3Tp/logo.png" 
                  alt="Logo" 
                  className="relative w-[400px] h-auto max-w-[90vw] object-contain drop-shadow-2xl"
              />
          </div>
      </div>

      {/* Loading Spinner */}
      <div className="mb-4">
        <div className="w-8 h-8 border-4 border-[#1e293b] border-t-blue-500 rounded-full animate-spin"></div>
      </div>

      {/* Status Text */}
      <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider h-4 animate-pulse">
          {status}
      </div>
    </div>
  );
};
