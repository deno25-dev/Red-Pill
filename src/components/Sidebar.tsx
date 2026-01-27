
import React from 'react';
import { ActivePanel } from '@/types';
import { Layers, List, AlignJustify } from 'lucide-react';

interface SidebarProps {
  activePanel: ActivePanel;
  onTogglePanel: (panel: ActivePanel) => void;
  children?: React.ReactNode;
}

export const Sidebar: React.FC<SidebarProps> = ({ activePanel, onTogglePanel, children }) => {
  const isOpen = activePanel !== 'none';

  return (
    <div className="flex h-full border-l border-[#334155] bg-[#1e293b]">
      {/* Expanded Content Area */}
      <div 
        className={`
          flex flex-col transition-all duration-300 ease-in-out overflow-hidden
          ${isOpen ? 'w-72 opacity-100' : 'w-0 opacity-0'}
        `}
      >
        {children}
      </div>

      {/* Navigation Strip */}
      <div className="w-12 bg-[#0f172a] flex flex-col items-center py-4 gap-4 border-l border-[#334155] z-10 shrink-0">
        <button
          onClick={() => onTogglePanel(activePanel === 'watchlist' ? 'none' : 'watchlist')}
          className={`p-2 rounded-lg transition-colors ${activePanel === 'watchlist' ? 'bg-[#334155] text-blue-400' : 'text-slate-400 hover:text-white hover:bg-[#1e293b]'}`}
          title="Watchlist (Alt+W)"
        >
          <List size={20} />
        </button>

        <button
          onClick={() => onTogglePanel(activePanel === 'layers' ? 'none' : 'layers')}
          className={`p-2 rounded-lg transition-colors ${activePanel === 'layers' ? 'bg-[#334155] text-blue-400' : 'text-slate-400 hover:text-white hover:bg-[#1e293b]'}`}
          title="Object Tree (Alt+L)"
        >
          <Layers size={20} />
        </button>

        <button
          onClick={() => onTogglePanel(activePanel === 'details' ? 'none' : 'details')}
          className={`p-2 rounded-lg transition-colors ${activePanel === 'details' ? 'bg-[#334155] text-blue-400' : 'text-slate-400 hover:text-white hover:bg-[#1e293b]'}`}
          title="Details"
        >
          <AlignJustify size={20} />
        </button>
      </div>
    </div>
  );
};
