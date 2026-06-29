/**
 * System tray icon + context menu.
 *
 * The panel has no taskbar button and no window chrome, so the tray is the
 * user's handle on the app: show/hide, toggle incognito, and quit. Menu item
 * state (checkmarks) is rebuilt every time the menu opens so it always reflects
 * current settings.
 */
import { Menu, Tray, app, nativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { PATHS } from '../store/paths'
import { loadSettings, saveSettings } from '../store/settings'
import { getMainWindow, setVisible } from './window'
import { pushState } from './state'

let tray: Tray | null = null

/** Build a tiny monochrome tray icon if no on-disk icon exists (first run). */
function fallbackIcon(): Electron.NativeImage {
  // 16x16 transparent PNG with a centered accent dot.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAW0lEQVR4AcXOMQ4AIQhF4eD9' +
      '/yWhVSChGAyMKlmJUqCYjCDxgi+gnqEVREe0g1FXuATdQI/CBXQMvABjgn0wAbJBHzPmJ2gB' +
      '1mYAAAAASUVORK5CYII=',
    'base64'
  )
  return nativeImage.createFromBuffer(png).resize({ width: 16, height: 16 })
}

export function createTray(): Tray {
  const iconPath = PATHS.icon()
  const image = existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : fallbackIcon()
  tray = new Tray(image)
  tray.setToolTip('Edge-Drop')

  const rebuild = () => {
    const settings = loadSettings()
    const menu = Menu.buildFromTemplate([
      {
        label: 'Show panel',
        click: () => {
          console.log('[Main] Context menu "Show panel" clicked')
          setVisible(true)
          getMainWindow()?.focus()
          pushState.togglePanel()
        }
      },
      {
        label: 'Hide panel',
        click: () => setVisible(false)
      },
      { type: 'separator' },
      {
        label: 'Incognito (pause capture)',
        type: 'checkbox',
        checked: settings.incognito,
        click: (item) => {
          const next = saveSettings({ incognito: item.checked })
          pushState.settings(next)
          applyIncognito(next.incognito)
        }
      },
      {
        label: 'Launch at login',
        type: 'checkbox',
        checked: settings.launchAtLogin,
        click: (item) => saveSettings({ launchAtLogin: item.checked })
      },
      { type: 'separator' },
      {
        label: 'Quit Edge-Drop',
        click: () => {
          app.quit()
        }
      }
    ])
    tray?.setContextMenu(menu)
  }

  tray.on('click', () => {
    console.log('[Main] Tray icon left-clicked')
    const win = getMainWindow()
    if (!win) return
    setVisible(true)
    pushState.togglePanel()
  })

  // Refresh checkmarks each time the menu is shown.
  tray.on('right-click', () => tray?.popUpContextMenu())
  rebuild()
  return tray
}

/** Reflect incognito toggle into the watcher without the renderer round-trip. */
let incognitoApply: ((v: boolean) => void) | null = null
export function registerIncognitoApplier(fn: (v: boolean) => void): void {
  incognitoApply = fn
}
function applyIncognito(v: boolean): void {
  incognitoApply?.(v)
}
