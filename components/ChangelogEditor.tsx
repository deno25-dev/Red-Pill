
import React, { useState, useEffect } from 'react';
import { X, Save, RotateCcw, Plus, Trash2, FileEdit } from 'lucide-react';
import { useChangelog } from '../hooks/useChangelog';
import { VersionLog, ChangeLogItem } from '../constants/changelog';

interface ChangelogEditorProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ChangelogEditor: React.FC<ChangelogEditorProps> = ({ isOpen, onClose }) => {
    const { data, save, reset } = useChangelog();
    const [formData, setFormData] = useState<VersionLog>(data);
    const [hasChanges, setHasChanges] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setFormData(data);
            setHasChanges(false);
        }
    }, [isOpen, data]);

    const handleChange = (field: keyof VersionLog, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setHasChanges(true);
    };

    const handleItemChange = (index: number, field: keyof ChangeLogItem, value: any) => {
        const newChanges = [...formData.changes];
        newChanges[index] = { ...newChanges[index], [field]: value };
        setFormData(prev => ({ ...prev, changes: newChanges }));
        setHasChanges(true);
    };

    const addItem = () => {
        setFormData(prev => ({
            ...prev,
            changes: [...prev.changes, { type: 'new', description: '' }]
        }));
        setHasChanges(true);
    };

    const removeItem = (index: number) => {
        setFormData(prev => ({
            ...prev,
            changes: prev.changes.filter((_, i) => i !== index)
        }));
        setHasChanges(true);
    };

    const handleSave = async () => {
        await save(formData);
        setHasChanges(false);
        alert('Changelog saved successfully!');
    };

    const handleReset = async () => {
        if (confirm('Reset to default changelog (from source code)? This will discard custom changes.')) {
            await reset();
            setHasChanges(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-y-0 right-0 w-[450px] bg-[#0f172a] border-l border-[#334155] shadow-2xl z-[10000] flex flex-col font-sans animate-in slide-in-from-right duration-200">
            
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#334155] bg-[#1e293b]">
                <div className="flex items-center gap-2 font-bold text-slate-200">
                    <FileEdit size={18} className="text-purple-400" />
                    <span>Changelog Editor</span>
                </div>
                <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                    <X size={20} />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
                
                {/* Meta Fields */}
                <div className="space-y-4 bg-[#1e293b]/50 p-4 rounded-lg border border-[#334155]/50">
                    <div className="space-y-1">
                        <label className="text-xs text-slate-400 font-bold uppercase">Version</label>
                        <input 
                            type="text" 
                            value={formData.version} 
                            onChange={(e) => handleChange('version', e.target.value)}
                            className="w-full bg-[#0f172a] border border-[#334155] rounded px-3 py-2 text-sm text-white focus:border-purple-500 outline-none font-mono"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-slate-400 font-bold uppercase">Date</label>
                        <input 
                            type="date" 
                            value={formData.date} 
                            onChange={(e) => handleChange('date', e.target.value)}
                            className="w-full bg-[#0f172a] border border-[#334155] rounded px-3 py-2 text-sm text-white focus:border-purple-500 outline-none"
                        />
                    </div>
                </div>

                {/* Items List */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <label className="text-xs text-slate-400 font-bold uppercase">Change Items</label>
                        <button 
                            onClick={addItem}
                            className="flex items-center gap-1 text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded transition-colors"
                        >
                            <Plus size={12} /> Add Item
                        </button>
                    </div>

                    <div className="space-y-3">
                        {formData.changes.map((item, idx) => (
                            <div key={idx} className="bg-[#1e293b] rounded border border-[#334155] p-3 space-y-2 group relative">
                                <div className="flex gap-2">
                                    <select
                                        value={item.type}
                                        onChange={(e) => handleItemChange(idx, 'type', e.target.value)}
                                        className={`flex-1 bg-[#0f172a] border border-[#334155] rounded px-2 py-1 text-xs outline-none uppercase font-bold ${
                                            item.type === 'new' ? 'text-emerald-400' :
                                            item.type === 'improvement' ? 'text-blue-400' : 'text-amber-400'
                                        }`}
                                    >
                                        <option value="new">New</option>
                                        <option value="improvement">Improvement</option>
                                        <option value="fix">Fix</option>
                                    </select>
                                    <button 
                                        onClick={() => removeItem(idx)}
                                        className="p-1.5 text-slate-500 hover:text-red-400 rounded hover:bg-[#0f172a] transition-colors"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                                <textarea 
                                    value={item.description}
                                    onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                                    className="w-full bg-[#0f172a] border border-[#334155] rounded p-2 text-xs text-slate-300 focus:border-purple-500 outline-none resize-none"
                                    rows={2}
                                    placeholder="Description..."
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t border-[#334155] bg-[#1e293b] flex gap-3">
                <button 
                    onClick={handleReset}
                    className="flex items-center gap-2 px-3 py-2 border border-[#334155] text-slate-400 hover:text-white hover:bg-[#334155] rounded text-xs font-bold uppercase transition-colors"
                >
                    <RotateCcw size={14} /> Reset
                </button>
                <button 
                    onClick={handleSave}
                    disabled={!hasChanges}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-xs font-bold uppercase transition-all ${
                        hasChanges 
                        ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg' 
                        : 'bg-[#334155] text-slate-500 cursor-not-allowed'
                    }`}
                >
                    <Save size={14} /> Save Changes
                </button>
            </div>
        </div>
    );
};
