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
      <div className="relative mb-10 flex flex-col items-center justify-center">
          <div className="relative animate-in fade-in zoom-in duration-700">
              {/* Glow effect behind logo */}
              <div className="absolute inset-0 bg-blue-500/20 blur-[60px] rounded-full animate-pulse"></div>
              <img 
                  src="https://i.postimg.cc/SK0PR3Tp/logo.png" 
                  alt="Logo" 
                  className="relative w-[250px] h-[250px] object-contain drop-shadow-2xl"
              />
          </div>
      </div>

      {/* Loading Spinner */}
      <div className="mb-8">
        <div className="w-8 h-8 border-4 border-[#1e293b] border-t-blue-500 rounded-full animate-spin"></div>
      </div>

      {/* App Title */}
      <div className="text-center mb-2 animate-in slide-in-from-bottom-4 duration-700 delay-200 fade-in">
          <h1 className="text-3xl font-bold text-white tracking-tight mb-2 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
            Red Pill Charting
          </h1>
          <p className="text-slate-500 text-xs font-mono tracking-widest uppercase">
            v0.2.2 • Offline-First Architecture
          </p>
      </div>

      {/* Status Text */}
      <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider h-4 animate-pulse">
          {status}
      </div>
    </div>
  );
};