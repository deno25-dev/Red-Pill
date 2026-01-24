import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './src/components/App';
import { GlobalModalManager } from './src/components/GlobalModalManager';
import './src/index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error("Root element not found");

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <GlobalModalManager />
    <App />
  </React.StrictMode>
);