import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './src/components/App';
import { GlobalModalManager } from './src/components/GlobalModalManager';
import './src/index.css';
import { report } from './src/utils/logger';

console.log('Bridge: main.tsx mounting sequence initiated');

try {
  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error("Root element '#root' not found in index.html");

  const root = ReactDOM.createRoot(rootElement);
  
  root.render(
    <React.StrictMode>
      <GlobalModalManager />
      <App />
    </React.StrictMode>
  );
  
  console.log('Bridge: React Root mounted successfully');

} catch (error: any) {
  console.error("Bridge Critical Failure:", error);
  
  // Telemetry Report
  report('System', 'Bridge Mount Failed', { 
    message: error.message, 
    stack: error.stack 
  }, 'error');

  // Hard DOM Fallback to prevent white screen of death
  const rootElement = document.getElementById('root');
  if (rootElement) {
    rootElement.innerHTML = `
      <div style="background:#0f172a; color:#ef4444; height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; font-family:monospace; padding:20px; text-align:center;">
        <h1 style="font-size:24px; margin-bottom:10px;">SYSTEM FAILURE</h1>
        <p style="color:#94a3b8; margin-bottom:20px;">The Bridge could not establish a connection to the React core.</p>
        <div style="background:#1e293b; padding:15px; border-radius:8px; text-align:left; border:1px solid #334155; max-width:600px; overflow:auto;">
          ${error.message}
        </div>
      </div>
    `;
  }
}