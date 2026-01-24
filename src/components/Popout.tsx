
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface PopoutProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export const Popout: React.FC<PopoutProps> = ({ title, onClose, children }) => {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const externalWindow = useRef<Window | null>(null);

  useEffect(() => {
    // Create new window
    const win = window.open('', '', 'width=800,height=600,left=200,top=200');
    if (!win) {
        alert("Popup blocked! Please allow popups for this site.");
        onClose();
        return;
    }
    
    externalWindow.current = win;
    win.document.title = title;

    // Copy styles from main window
    Array.from(document.styleSheets).forEach(styleSheet => {
      try {
        if (styleSheet.href) {
          const newLinkEl = win.document.createElement('link');
          newLinkEl.rel = 'stylesheet';
          newLinkEl.href = styleSheet.href;
          win.document.head.appendChild(newLinkEl);
        } else if (styleSheet.cssRules) {
          const newStyleEl = win.document.createElement('style');
          Array.from(styleSheet.cssRules).forEach(rule => {
            newStyleEl.appendChild(win.document.createTextNode(rule.cssText));
          });
          win.document.head.appendChild(newStyleEl);
        }
      } catch (e) {
        // Ignore CORS issues with stylesheets
      }
    });

    // Create container
    const div = win.document.createElement('div');
    div.id = 'popout-root';
    div.style.height = '100vh';
    div.style.width = '100vw';
    div.style.backgroundColor = '#0f172a'; // Match app bg
    div.style.color = '#e2e8f0';
    div.className = 'bg-app-bg text-text-primary';
    win.document.body.appendChild(div);
    win.document.body.style.margin = '0';
    win.document.body.style.overflow = 'hidden';
    
    setContainer(div);

    // Handle close
    win.addEventListener('beforeunload', () => {
      onClose();
    });

    return () => {
      if (externalWindow.current && !externalWindow.current.closed) {
        externalWindow.current.close();
      }
    };
  }, []);

  if (!container) return null;

  return createPortal(children, container);
};
