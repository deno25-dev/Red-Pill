
import React, { useState, useEffect } from 'react';
import { Sparkles, Save, X } from 'lucide-react';

interface ChangelogEditorProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ChangelogEditor: React.FC<ChangelogEditorProps> = ({ isOpen, onClose }) => {
    const [text, setText] = useState('');

    useEffect(() => {
        if (isOpen) {
            setText(localStorage.getItem('app_changelog_data') || '');
        }
    }, [isOpen]);

    const handleSave = () => {
        // 1. Save to Local Storage (Immediate User View)
        localStorage.setItem('app_changelog_data', text);

        // 2. Generate Seed Code (For Developer/Build Persistence)
        const rawString = JSON.stringify(text);
        const copyMessage = `export const DEFAULT_LATEST_ADD = ${rawString};`;

        // 3. Output to Console
        console.log('%c=== TIER 1: PUBLIC CHANGELOG UPDATED ===', 'color: #a855f7; font-weight: bold; font-size: 14px;');
        console.log('Copy this to constants/seedData.ts to persist for new users:');
        console.log(copyMessage);
        
        alert(`Public 'Latest Add' Updated.\n\nThe user-facing panel now shows this content.\nCheck console for seedData.ts snippet.`);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center backdrop-blur-sm" style={{ zIndex: 10001 }}>
            <div className="bg-[#1e293b] border border-[#334155] p-0 w-[600px] h-[500px] flex flex-col rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                
                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 bg-[#0f172a] border-b border-[#334155]">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2 text-purple-400">
                            <Sparkles size={18} />
                            <h3 className="text-lg font-bold text-white">Public 'Latest Add' Editor</h3>
                        </div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Tier 1: Manual User Updates</span>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><X size={20} /></button>
                </div>

                {/* Info Bar */}
                <div className="bg-purple-900/10 px-6 py-2 text-[11px] text-purple-300 border-b border-purple-500/10">
                    Write plain text updates here. This content is shown directly to users in the "Latest Updates" panel. Avoid technical jargon.
                </div>

                {/* Editor */}
                <textarea 
                    value={text} 
                    onChange={(e) => setText(e.target.value)}
                    className="flex-1 bg-[#1e293b] text-slate-200 p-6 font-mono text-sm focus:outline-none resize-none leading-relaxed"
                    placeholder="• Added new feature X..."
                    spellCheck={false}
                />

                {/* Footer */}
                <div className="flex justify-end gap-3 p-4 bg-[#0f172a] border-t border-[#334155]">
                    <button 
                        onClick={onClose} 
                        className="px-4 py-2 text-slate-400 hover:text-white transition-colors text-sm font-medium"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleSave} 
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-bold shadow-lg transition-colors flex items-center gap-2"
                    >
                        <Save size={16} />
                        Save Public Update
                    </button>
                </div>
            </div>
        </div>
    );
};
