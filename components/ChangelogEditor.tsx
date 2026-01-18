
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
        localStorage.setItem('app_changelog_data', text);
        alert('Changelog Saved Locally');
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center" style={{ zIndex: 10001 }}>
            <div className="bg-[#111] border border-[#333] p-6 w-[600px] h-[500px] flex flex-col gap-4 rounded-lg shadow-xl">
                <h3 className="text-white text-lg font-bold">Editor</h3>
                <textarea 
                    value={text} 
                    onChange={(e) => setText(e.target.value)}
                    className="flex-1 bg-[#222] text-white p-4 font-mono text-sm border border-[#444] rounded focus:outline-none focus:border-blue-500"
                    placeholder="Enter updates here..."
                />
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded">Save Updates</button>
                </div>
            </div>
        </div>
    );
};
