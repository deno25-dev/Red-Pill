import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';

interface PopoutProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export const Popout: React.FC<PopoutProps> = ({ title, onClose, children }) => {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const windowRef = useRef<Window | null>(null);

  useEffect(() => {
    // Open a new window
    const win = window.open('', '', 'width=900,height=700,left=200,top=200');
    if (!win) {
        alert("Popout blocked. Please allow popups for this site.");
        onClose();
        return;
    }
    windowRef.current = win;
    win.document.title = title;

    // Inject Tailwind
    const script = win.document.createElement('script');
    script.src = "https://cdn.tailwindcss.com";
    win.document.head.appendChild(script);

    // Inject Base Styles
    const style = win.document.createElement('style');
    style.textContent = `
      body { 
        margin: 0; 
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
        background-color: #0f172a; 
        color: #e2e8f0; 
        overflow: hidden; 
        height: 100vh; 
        width: 100vw; 
      }
      #popout-root { 
        height: 100%; 
        width: 100%; 
        display: flex; 
        flex-direction: column; 
      }
      /* Custom scrollbar */
      ::-webkit-scrollbar { width: 8px; height: 8px; }
      ::-webkit-scrollbar-track { background: #1e293b; }
      ::-webkit-scrollbar-thumb { background: #475569; border-radius: 4px; }
      ::-webkit-scrollbar-thumb:hover { background: #64748b; }
    `;
    win.document.head.appendChild(style);

    const div = win.document.createElement('div');
    div.id = 'popout-root';
    win.document.body.appendChild(div);
    setContainer(div);

    // Copy main window stylesheets if any (for Lucide icons usually injected via JS or CSS?)
    // Lucide icons are SVG inline, so they work.
    // However, if we had external CSS files, we'd copy them here.

    const handleUnload = () => {
        onClose();
    };

    win.addEventListener('beforeunload', handleUnload);

    return () => {
      win.removeEventListener('beforeunload', handleUnload);
      win.close();
    };
  }, []);

  return container ? createPortal(children, container) : null;
};