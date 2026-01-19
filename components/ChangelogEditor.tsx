
import React, { useState, useEffect } from 'react';

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
        // We stringify the text to safely escape newlines and quotes for insertion into TypeScript
        const rawString = JSON.stringify(text);
        const copyMessage = `export const DEFAULT_LATEST_ADD = ${rawString};`;

        // 3. Output to Developer
        console.log('%c=== COPY THIS TO constants/seedData.ts ===', 'color: #00ff00; font-weight: bold; font-size: 14px;');
        console.log(copyMessage);
        console.log('%c==========================================', 'color: #00ff00; font-weight: bold; font-size: 14px;');

        alert(`Changelog Saved Locally.\n\nCheck the Console (F12) for the raw code string.\nCopy and paste it into 'constants/seedData.ts' to persist this update in the next build.`);
        
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center" style={{ zIndex: 10001 }}>
            <div className="bg-[#111] border border-[#333] p-6 w-[600px] h-[500px] flex flex-col gap-4 rounded-lg shadow-xl">
                <div className="flex justify-between items-center">
                    <h3 className="text-white text-lg font-bold">Latest Add Editor</h3>
                    <span className="text-[10px] text-gray-500 uppercase tracking-widest">Dev Mode</span>
                </div>
                <div className="text-xs text-gray-400 -mt-2">
                    Enter updates below. Saving will update your local view and generate a code snippet in the console to make it permanent.
                </div>
                <textarea 
                    value={text} 
                    onChange={(e) => setText(e.target.value)}
                    className="flex-1 bg-[#222] text-white p-4 font-mono text-sm border border-[#444] rounded focus:outline-none focus:border-blue-500 resize-none"
                    placeholder="• New feature added..."
                />
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white transition-colors">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold shadow-lg transition-colors">Save & Generate Seed</button>
                </div>
            </div>
        </div>
    );
};
