
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

    // Set theme attribute to match main window
    win.document.documentElement.setAttribute('data-theme', document.documentElement.getAttribute('data-theme') || 'dark');

    // Copy styles from parent window (Offline support)
    Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).forEach((node) => {
        win.document.head.appendChild(node.cloneNode(true));
    });

    // Inject Base Styles
    const style = win.document.createElement('style');
    style.textContent = `
      body { 
        margin: 0; 
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
        background-color: var(--app-bg); 
        color: var(--text-primary); 
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
    `;
    win.document.head.appendChild(style);

    const div = win.document.createElement('div');
    div.id = 'popout-root';
    win.document.body.appendChild(div);
    setContainer(div);

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
