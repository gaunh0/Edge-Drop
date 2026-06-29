/**
 * The edge panel BrowserWindow.
 *
 * The window is the full *expanded* size and sits at the left edge of the
 * primary display's work area. It is transparent and frameless, and is normally
 * click-through (`setIgnoreMouseEvents(true, { forward: true })`) so the desktop
 * stays fully usable. The renderer listens for pointer movement across the whole
 * page (which is still delivered even while click-through, thanks to `forward`)
 * and toggles interactivity via `setInteractive` once the cursor dwells in the
 * hot zone. This is what produces the "invisible until you approach the edge"
 * effect without a separate hidden trigger window.
 *
 * Drag-in support: because click-through windows cannot receive HTML5 drag
 * events (only pointer events are forwarded), we create a separate thin
 * "detector" window layered behind the main panel. It is always interactive
 * and transparent — its body uses CSS `pointer-events: none` so regular clicks
 * pass through to the desktop, but the BrowserWindow itself *does* receive
 * OS drag events. When it detects a Files-type dragenter, it sends an IPC
 * signal (`detector:file-drag-enter`) that is handled in index.ts to open
 * the panel and make it interactive.
 *
 * NOTE: this module must NOT import from state.ts to avoid circular dependencies.
 */
import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'node:path'
import { APP_CONFIG } from './config'
import { runtime } from './config'

export const PANEL_WIDTH = 384
/** Visual width of the blade when collapsed (only used by the renderer). */
export const COLLAPSED_WIDTH = 0

let mainWindow: BrowserWindow | null = null
let detectorWindow: BrowserWindow | null = null
let interactive = false

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

/** True when the window currently accepts mouse clicks (blade is "open"). */
export function isInteractive(): boolean {
  return interactive
}

/**
 * Toggle whether the panel swallows pointer events.
 *
 * - interactive=false -> click-through (cursor passes to the desktop) but mouse
 *   move events are still forwarded so we can detect the hot zone.
 * - interactive=true  -> normal interactive window.
 */
export function setInteractive(value: boolean): void {
  if (!mainWindow || value === interactive) return
  interactive = value
  mainWindow.setIgnoreMouseEvents(!value, { forward: !value })
}

/** Compute geometry anchored to the left edge of the primary display. */
function edgeGeometry(): { x: number; y: number; width: number; height: number } {
  const display = screen.getPrimaryDisplay()
  const workArea = display.workArea
  return {
    x: workArea.x,
    y: workArea.y,
    width: PANEL_WIDTH,
    height: workArea.height
  }
}

export function createWindow(): BrowserWindow {
  const { x, y, width, height } = edgeGeometry()

  mainWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    show: false,
    frame: false,
    fullscreenable: false,
    maximizable: false,
    minWidth: PANEL_WIDTH,
    minHeight: 320,
    movable: false,
    resizable: false,
    transparent: true,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    roundedCorners: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  // Start click-through so the panel is invisible to clicks until hovered.
  mainWindow.setIgnoreMouseEvents(true, { forward: true })

  // Keep the panel glued to the primary display if the work area changes.
  screen.on('display-metrics-changed', () => {
    if (!mainWindow?.isVisible()) return
    const g = edgeGeometry()
    mainWindow.setBounds({ ...g })
    if (detectorWindow && !detectorWindow.isDestroyed()) {
      detectorWindow.setBounds({ x: g.x, y: g.y, width: g.width, height: g.height })
    }
  })

  // Respect OS-level always-on-top reordering.
  mainWindow.on('focus', () => {
    if (interactive) mainWindow?.setAlwaysOnTop(true, 'screen-saver')
  })

  // Open external links in the default browser.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Load the renderer.
  if (APP_CONFIG.is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.on('console-message', (_event, _level, message, line, sourceId) => {
    console.log(`[Renderer] ${message} (${sourceId}:${line})`)
  })

  mainWindow.on('close', (e) => {
    if (!runtime.quitting) {
      e.preventDefault()
    }
  })

  // Create the detector window for OS drag-in awareness.
  createDetectorWindow(x, y, width, height)

  return mainWindow
}

/**
 * Thin invisible detector window for OS file drag awareness.
 *
 * When the main panel is click-through, HTML5 drag events (dragenter/dragover/drop)
 * are NOT forwarded — only pointer events are. This window sits in the same
 * position but is always interactive and transparent. It detects incoming file
 * drags and sends `detector:file-drag-enter` via the preload bridge so the
 * main process (handled in index.ts) can open the panel + make it interactive.
 *
 * The body has `pointer-events: none` so regular mouse clicks pass through
 * to the desktop, but the BrowserWindow itself still receives drag events.
 */
function createDetectorWindow(x: number, y: number, w: number, h: number): void {
  // Minimal HTML: the detector uses the preload bridge (window.edge) to send IPC.
  // It listens for dragenter/dragover/drop on the document and sends a signal
  // when Files are detected.
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0}
  html,body{width:100%;height:100%;background:transparent;pointer-events:none;overflow:hidden}
</style></head><body>
<script>
  document.addEventListener('dragenter', function(e) {
    if (e.dataTransfer && e.dataTransfer.types.indexOf && e.dataTransfer.types.indexOf('Files') >= 0) {
      e.preventDefault();
      if (window.edge) window.edge.setInteractive(true);
    }
  });
  document.addEventListener('dragover', function(e) {
    if (e.dataTransfer && e.dataTransfer.types.indexOf && e.dataTransfer.types.indexOf('Files') >= 0) {
      e.preventDefault();
    }
  });
  document.addEventListener('drop', function(e) {
    e.preventDefault();
  });
</script>
</body></html>`

  // Center vertically, 30% height so we don't block the Start menu / taskbar clicks
  const detHeight = Math.floor(h * 0.3)
  const detY = y + Math.floor((h - detHeight) / 2)

  detectorWindow = new BrowserWindow({
    x,
    y: detY,
    width: 20,
    height: detHeight,
    show: false,
    frame: false,
    fullscreenable: false,
    maximizable: false,
    movable: false,
    resizable: false,
    transparent: true,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    roundedCorners: false,
    focusable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  // This window must NOT be click-through — it needs to receive drag events.
  detectorWindow.setIgnoreMouseEvents(false)

  // Layer behind the main panel (lower always-on-top level).
  detectorWindow.setAlwaysOnTop(true, 'normal')

  detectorWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

  detectorWindow.once('ready-to-show', () => {
    detectorWindow?.showInactive()
  })

  detectorWindow.on('close', (e) => {
    if (!runtime.quitting) {
      e.preventDefault()
    }
  })
}

/** Toggle the panel between shown (always on top) and fully hidden. */
export function setVisible(visible: boolean): void {
  if (!mainWindow) return
  if (visible) mainWindow.showInactive()
  else mainWindow.hide()
}
