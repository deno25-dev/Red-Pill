
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/components/App';
import { GlobalModalManager } from '@/components/GlobalModalManager';
import '../index.css';

// --- MANDATE 0.6: Early Crash Detection ---
// Catch synchronous errors before React mounts
window.addEventListener('error', (event) => {
    console.error(
        '%c[CRITICAL BOOT ERROR] Uncaught Exception:',
        'background: #7f1d1d; color: #fca5a5; font-weight: bold; padding: 4px; border-radius: 2px;',
        event.error ? event.error.stack : event.message
    );
});

// Catch async promise rejections (often IPC or Network related)
window.addEventListener('unhandledrejection', (event) => {
    console.error(
        '%c[CRITICAL BOOT ERROR] Unhandled Promise Rejection:',
        'background: #7f1d1d; color: #fca5a5; font-weight: bold; padding: 4px; border-radius: 2px;',
        event.reason ? (event.reason.stack || event.reason) : 'Unknown reason'
    );
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <GlobalModalManager />
    <App />
  </React.StrictMode>
);
