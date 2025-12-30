# Red Pill Charting - Source of Truth

**Version:** 1.0.0
**Last Updated:** 2024-05-23

This document serves as the absolute source of truth for all development sessions. All AI agents and developers must adhere strictly to these architectural mandates, coding standards, and branding rules.

---

## 1. Project Overview

**Red Pill Charting** is an offline-first, high-performance financial charting platform. It allows users to analyze massive datasets from local CSV files without relying on internet connectivity or external chart libraries' data feeds.

### Tech Stack
*   **Frontend:** React 19+, Vite 5+, TypeScript.
*   **Styling:** Tailwind CSS (v3.4+), Lucide React (Icons).
*   **Charting Engine:** Lightweight Charts (v5.0+).
*   **Backend/Runtime:** Electron (Main Process) / Rust (High-performance data parsing & heavy computation).

---

## 2. Architectural Mandates

### The "Dual-Stream" Data Logic
The application explicitly separates data sources based on their purpose. These streams **must not cross**.

#### Stream A: The Main Chart (Offline/Local)
*   **Source:** Strictly local files (CSV/TXT) selected by the user via the System File Dialog or the `Data Explorer` panel.
*   **Mechanism:** Data is parsed via `utils/dataUtils.ts` (or Rust backend).
*   **Constraint:** The Main Chart **never** fetches historical candle data from an external API (like Binance/CoinGecko). It is a visualizer for *local data only*.
*   **Reasoning:** Privacy, performance, and offline reliability.

#### Stream B: Market Overview (Online/Live)
*   **Source:** Live WebSocket/REST APIs (e.g., Binance API) via `hooks/useLiveData.ts`.
*   **Mechanism:** Fetches 24h ticker stats, spot prices, and volumes.
*   **Constraint:** This data is **only** displayed in the "Market Overview" side panel, Watchlist, or Header Ticker. It is **never** plotted on the main candlestick chart.
*   **Failure State:** If offline, this stream dies gracefully without breaking Stream A.

---

## 3. Offline-First Guardrails

The application must be fully functional for charting purposes without an internet connection.

### 3.1 Connectivity Check
*   **Hook:** `hooks/useOnlineStatus.ts`
*   **Usage:** Components relying on Stream B must check this hook before attempting network requests.
    ```typescript
    const isOnline = useOnlineStatus();
    if (!isOnline) return <OfflineFallback />;
    ```

### 3.2 Error Boundaries
*   **Component:** `GlobalErrorBoundary.tsx`
*   **Usage:** Wrap all major feature panels (Chart, Market Overview, Trading Panel).
*   **Behavior:** If a component crashes, the rest of the app must remain usable.

### 3.3 UI Fallbacks
*   **Component:** `MarketOfflineFallback.tsx`
*   **Requirement:** When Stream B fails (offline/API error), display this specific visual component. Do not show generic spinners indefinitely.

---

## 4. Theming System

The app utilizes a CSS-variable based theming system to support "Financial Dark Mode" and potential future skins.

### Core Variables (`index.css`)
All colors in React/Tailwind must reference these variables, not hardcoded hex values.

| Variable | Tailwind Class | Description |
| :--- | :--- | :--- |
| `--app-bg` | `bg-app-bg` | Deepest background (App container) |
| `--panel-bg` | `bg-panel-bg` | Secondary background (Sidebars, modals) |
| `--border-color` | `border-app-border` | Low-contrast dividers |
| `--accent-color` | `text-accent` | Primary action color (Blue) |
| `--text-primary` | `text-text-primary` | High readability text |
| `--text-secondary`| `text-text-secondary`| Muted labels |

### Configuration
*   Tailwind config (`tailwind.config.js`) maps these variables to utility classes.
*   Theme switching is handled by modifying `data-theme` attributes or root CSS variables via `components/BackgroundSettingsDialog.tsx`.

---

## 5. Branding & Visual Rules

### 5.1 No Third-Party Branding
*   **Strict Prohibition:** The app must **NOT** display logos, "Powered by", or attribution links for:
    *   TradingView
    *   Binance
    *   Any other data provider
*   **Implementation:** CSS rules in `index.css` explicitly hide the `tv-lightweight-charts-attribution` class.

### 5.2 Aesthetic Guidelines
*   **Style:** "Red Pill" / "Terminal" / "Bloomberg Terminal".
*   **Vibe:** Professional, high-density information, low-distraction.
*   **Icons:** Use `lucide-react` exclusively. No FontAwesome or other icon sets.

---

## 6. Diagnostic Standards

To ensure stability and ease of debugging in production builds, all components must adhere to the logging standard.

### 6.1 The Developer Panel
*   **Component:** `components/DeveloperTools.tsx`
*   **Access:** Toggled via `Ctrl + D`.
*   **Function:** Displays live logs, network status, and render performance metrics.

### 6.2 Logging Requirement
*   **Do Not Use:** `console.log` for critical application flow.
*   **Must Use:** `debugLog` from `utils/logger.ts`.
*   **Categories:** 'Data', 'Network', 'Auth', 'UI', 'Perf'.

**Example:**
```typescript
import { debugLog } from '../utils/logger';

// Bad
console.log("File loaded", file.name);

// Good
debugLog('Data', 'Local file loaded successfully', { fileName: file.name, size: file.size });
```

### 6.3 Performance Tracking
*   **Event:** `chart-render-perf`
*   **Usage:** Dispatch this custom event after heavy operations (chart rendering, file parsing) to update the DevTools overlay.

```typescript
const endTime = performance.now();
window.dispatchEvent(new CustomEvent('chart-render-perf', { detail: { duration: endTime - startTime } }));
```
