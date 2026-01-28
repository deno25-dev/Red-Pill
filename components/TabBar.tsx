import React from 'react';
import { X, Plus, ExternalLink } from 'lucide-react';
import { TabSession } from '../types';

interface TabBarProps {
  tabs: TabSession[];
  activeTabId: string;
  onSwitch: (id: string) => void;
  onClose: (id: string, e: React.MouseEvent) => void;
  onDetach: (id: string, e: React.MouseEvent) => void;
  onAdd: () => void;
}

export const TabBar: React.FC<TabBarProps> = ({ tabs, activeTabId, onSwitch, onClose, onDetach, onAdd }) => {
  return (
    <div className="app-drag-region flex items-center bg-[#0f172a] border-b border-[#334155] pt-2 px-2 gap-1 overflow-x-auto select-none no-scrollbar shrink-0 pl-16 md:pl-2">
      {/* Added pl-16 padding on small screens or just general safe area if traffic lights exist, though standard on Windows works fine without extra padding if using overlay */}
      {tabs.map(tab => (
        <div
          key={tab.id}
          onClick={() => onSwitch(tab.id)}
          className={`
            app-no-drag group flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-t-lg min-w-[140px] max-w-[220px] cursor-pointer border-t border-x transition-colors relative
            ${activeTabId === tab.id 
              ? 'bg-[#1e293b] border-[#334155] text-white border-b-[#1e293b] pb-2.5 -mb-px z-10' 
              : 'bg-[#0f172a] border-transparent text-slate-500 hover:bg-[#1e293b]/50 hover:text-slate-300 border-b-[#334155]'
            }
          `}
        >
          {tab.isDetached && <ExternalLink size={10} className="text-blue-400" />}
          <span className="truncate flex-1">{tab.title}</span>
          
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
             {!tab.isDetached && (
                <button
                    onClick={(e) => { e.stopPropagation(); onDetach(tab.id, e); }}
                    className="p-1 rounded hover:bg-slate-700/50 text-slate-400 hover:text-blue-300"
                    title="Detach Tab"
                >
                    <ExternalLink size={12} />
                </button>
             )}
             <button
                onClick={(e) => { e.stopPropagation(); onClose(tab.id, e); }}
                className={`p-1 rounded hover:bg-slate-700/50 text-slate-400 hover:text-red-300 ${tabs.length === 1 ? 'hidden' : ''}`}
                title="Close Tab"
            >
                <X size={12} />
            </button>
          </div>
        </div>
      ))}
      <button
        onClick={onAdd}
        className="app-no-drag p-1.5 ml-1 text-slate-400 hover:text-white hover:bg-[#1e293b] rounded transition-colors"
        title="New Tab"
      >
        <Plus size={16} />
      </button>
    </div>
  );
};