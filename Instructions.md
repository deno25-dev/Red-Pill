# Red Pill Charting - Instructions

This document provides a brief overview of how to set up, run, and use the Red Pill Charting application.

## 1. Project Setup

This project is built with Vite, React, TypeScript, and is designed to run within an Electron wrapper for desktop functionality.

### Prerequisites
- Node.js (v18+)
- npm or yarn

### Installation
1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```

## 2. Running the Application

### Web Development Mode
For the quickest development feedback loop, run the Vite dev server. This will open the app in your browser. Note that Electron-specific features (like the internal Asset Library) will not be available.

```bash
npm run dev
```

### Electron Development Mode
To run the full application with desktop integration (file system access, etc.), use the Electron dev script. This will start the Vite server and then launch the Electron app.

```bash
npm run electron:dev
```

## 3. Key Features & Usage

### Data Loading
The application supports two primary ways of loading data:

1.  **Asset Library (Toolbar > Library icon):**
    -   This is the primary, zero-config method for desktop use.
    -   The app automatically scans the `Assets/` folder in its root directory.
    -   Organize your data by symbol into subfolders (e.g., `Assets/BTCUSDT/`, `Assets/EURUSD/`). The library will group timeframes under that symbol.
    -   Click "Refresh" in the library to re-scan the directory if you add new files while the app is running.

2.  **Data Explorer (Toolbar > Data Explorer icon):**
    -   This is for ad-hoc analysis of CSV files anywhere on your computer.
    -   Click "Select Folder" to open a system dialog and choose a directory to browse.

### Chart Interaction
- **Navigation:** Click and drag to pan the chart. Use the mouse wheel to zoom.
- **Drawing Tools:** Select tools from the left sidebar. Right-click on a tool to see more options or add it to your favorites bar.
- **Favorites Bar:** Toggle the floating favorites bar with the star icon in the sidebar. You can drag this bar anywhere on the screen.

### Bar Replay
- **Standard Replay (Rewind icon):** Click the "Bar Replay" button in the top toolbar, then click on the chart to select a starting point. A control panel will appear.
- **Advanced Replay (Purple Rewind icon):** A high-fidelity, real-time simulation for trading practice.

### Developer Diagnostics
- **Toggle Panel:** Press `Ctrl + D` to open or close the developer diagnostics panel.
- **Features:** View live application logs, network status, performance metrics, and copy a diagnostic report to your clipboard for bug reporting.
