
export interface ChangeLogItem {
    type: 'new' | 'improvement' | 'fix';
    description: string;
}

export interface VersionLog {
    version: string;
    date: string;
    changes: ChangeLogItem[];
}

// DEVELOPER MECHANISM: Update this object to reflect the latest changes.
// This file is compiled into the application and is not editable by the end user.
export const LATEST_ADDITIONS: VersionLog = {
    version: "1.2.0",
    date: new Date().toISOString().split('T')[0],
    changes: [
        { type: 'new', description: "Added 'Latest Add' panel to showcase new features." },
        { type: 'new', description: "Implemented 'Open Layout DB' for direct folder access." },
        { type: 'new', description: "Added Sticky Notes persistence and folder opener." },
        { type: 'improvement', description: "Enhanced toolbar menu organization." },
        { type: 'fix', description: "Fixed layout persistence issues in split view." }
    ]
};
