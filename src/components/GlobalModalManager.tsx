import React, { useState, useEffect } from 'react';
import { LatestAdditionsDialog } from './LatestAdditionsDialog';
import { ChangelogEditor } from './ChangelogEditor';

export const GlobalModalManager: React.FC = () => {
  const [isChangelogOpen, setChangelogOpen] = useState(false);
  const [isEditorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    const openChangelog = () => setChangelogOpen(true);
    const openEditor = () => setEditorOpen(true);

    window.addEventListener('OPEN_CHANGELOG', openChangelog);
    window.addEventListener('OPEN_CHANGELOG_EDITOR', openEditor);

    return () => {
      window.removeEventListener('OPEN_CHANGELOG', openChangelog);
      window.removeEventListener('OPEN_CHANGELOG_EDITOR', openEditor);
    };
  }, []);

  return (
    <>
      <LatestAdditionsDialog isOpen={isChangelogOpen} onClose={() => setChangelogOpen(false)} />
      <ChangelogEditor isOpen={isEditorOpen} onClose={() => setEditorOpen(false)} />
    </>
  );
};