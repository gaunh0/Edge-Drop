# Edge-Drop

A clipboard manager that lives hidden on the **left edge** of your screen and expands on hover.

## Features

- **Edge panel** — invisible, click-through window anchored to the left edge; hovers into view when your cursor enters the hot zone
- **Clipboard history** — captures text, rich HTML, images, and file paths automatically
- **Drag in / drag out** — drop multiple images or files into the shelf; drag items out into any other app (Photoshop, Explorer, Word…)
- **Search, pin, delete, clear** — all the essentials of a high-end clipboard manager
- **Deep-black macOS-inspired UI** — layered gradients, accent glow, inner light edge, smooth spring animations
- **Settings** — accent color, hot-zone position/height, history limit, incognito mode, reduce motion, launch at login
- **System tray** — show/hide, incognito toggle, quit

## Getting Started

```bash
npm install
npm run dev        # Launch with HMR
npm run build      # Production build
npm run typecheck  # Verify types
```

## How It Works

| Mechanism | Detail |
|---|---|
| **Edge hide/expand** | Transparent, frameless, always-on-top `BrowserWindow` at x=0. `setIgnoreMouseEvents(true, { forward: true })` makes it click-through but still dispatches pointer events. Renderer detects cursor in the hot band (leftmost 12px × middle 40% of screen) and toggles interactivity via IPC. |
| **Clipboard capture** | Polls every 600ms, computes a per-format signature for change detection, deduplicates, caps at the configured limit (default 500). |
| **Drag out** | Main writes item content to a temp file (image→PNG, text→.txt, files→original paths) and calls `webContents.startDrag({ file, icon })` — Electron's supported native OLE drag path. |
| **Drag in** | HTML5 `onDrop` + `webUtils.getPathForFile` (Electron ≥24) to resolve OS file objects back to absolute paths, bulk-added to the store. |
| **Persistence** | JSON index in `userData/items.json`, image files in `userData/images/`. Settings in `userData/settings.json`. |

## Stack

- **Electron** + **electron-vite** (main + preload + renderer HMR)
- **React** + **TypeScript** + **Framer Motion** + **Zustand**
- **Security**: contextIsolation on, nodeIntegration off, typed preload bridge, single-instance lock

## Project Structure

```
Edge-Drop/
├─ shared/          types, IPC contracts, bridge type
├─ electron/
│  ├─ main/          window, tray, IPC handlers, config, drag-out, entry
│  ├─ preload/       contextBridge API
│  ├─ clipboard/     ClipboardWatcher, format readers
│  └─ store/         ItemStore, settings, paths
├─ src/              React renderer
│  ├─ components/    Panel, ItemList, ClipboardItem, SearchBar, Header, Settings, Icons, EmptyState
│  ├─ hooks/         useEdgeHover, useDragOut, useFilteredItems
│  ├─ store/         Zustand appStore
│  ├─ lib/           edge bridge client, theme, format helpers
│  └─ styles/        tokens, global, panel, item, settings
└─ resources/        app icon
```
