
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
    version: "1.2.5",
    date: new Date().toISOString().split('T')[0],
    changes: [
        { type: 'new', description: "Added 'Restore' functionality to Database Browser for layouts." },
        { type: 'improvement', description: "Database Browser now lists layout files dynamically." },
        { type: 'new', description: "Added 'Latest Add' panel to showcase new features." },
        { type: 'new', description: "Implemented 'Open Layout DB' for direct folder access." },
        { type: 'new', description: "Added Sticky Notes persistence and folder opener." }
    ]
};
