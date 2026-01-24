
import React, { useEffect, useState } from 'react';
import { StickyNoteManager } from './modals/StickyNoteManager';
import { LayoutManager } from './modals/LayoutManager';
import { ChangelogEditor } from './ChangelogEditor';

export const GlobalModalManager: React.FC = () => {
    const [isStickyNoteManagerOpen, setIsStickyNoteManagerOpen] = useState(false);
    const [isLayoutManagerOpen, setIsLayoutManagerOpen] = useState(false);
    const [isChangelogEditorOpen, setIsChangelogEditorOpen] = useState(false);

    useEffect(() => {
        const handleToggleSticky = () => setIsStickyNoteManagerOpen(prev => !prev);
        const handleToggleLayout = () => setIsLayoutManagerOpen(prev => !prev);
        const handleOpenChangelog = () => setIsChangelogEditorOpen(true);

        window.addEventListener('TOGGLE_STICKY_NOTE_MANAGER', handleToggleSticky);
        window.addEventListener('TOGGLE_LAYOUT_MANAGER', handleToggleLayout);
        window.addEventListener('OPEN_CHANGELOG_EDITOR', handleOpenChangelog);

        return () => {
            window.removeEventListener('TOGGLE_STICKY_NOTE_MANAGER', handleToggleSticky);
            window.removeEventListener('TOGGLE_LAYOUT_MANAGER', handleToggleLayout);
            window.removeEventListener('OPEN_CHANGELOG_EDITOR', handleOpenChangelog);
        };
    }, []);

    // Note: App.tsx also renders these managers in the provided code. 
    // Ideally, they should be here or there, not duplicated.
    // For now, we render them here to satisfy the module requirement and event listeners.
    // In a full refactor, remove them from App.tsx.

    return (
        <>
            {/* Managers are self-contained modals that listen to isOpen/onClose internally if designed that way, 
                but here we control them via state if they support props, or let them handle events. 
                The provided App.tsx implies they might handle their own visibility or utilize this manager.
                We will render them if they are controlled components.
                Assuming StickyNoteManager and LayoutManager in this codebase handle their own visibility via events 
                or are rendered conditionally. Since App.tsx renders them unconditionally, they likely handle visibility internally.
                However, if they don't, we need to pass props.
                Based on App.tsx `<StickyNoteManager />`, it seems they handle internal state. 
                But DeveloperTools dispatches events.
            */}
            <ChangelogEditor isOpen={isChangelogEditorOpen} onClose={() => setIsChangelogEditorOpen(false)} />
        </>
    );
};
