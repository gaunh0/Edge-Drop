/**
 * Central runtime state & renderer notification hub.
 *
 * Owns the single ItemStore and ClipboardWatcher instances and provides typed
 * helpers to broadcast changes to the renderer. Every mutation goes through
 * here so there's one path that re-pushes the DTO list.
 */
import { ItemStore } from '../store/ItemStore'
import { ClipboardWatcher } from '../clipboard/ClipboardWatcher'
import { loadSettings, saveSettings } from '../store/settings'
import type { ClipboardItemDto, ItemData, Settings } from '../../shared/types'
import { getMainWindow } from './window'
import { createId } from '../store/ids'
import { nativeImage } from 'electron'
import { readFileSync } from 'node:fs'
import { PATHS } from '../store/paths'

const store = new ItemStore()
const watcher = new ClipboardWatcher(600)

/** Initialize persistence + start the clipboard watcher. */
export function initState(): void {
  store.load()
  watcher.start((data, png) => {
    if (loadSettings().incognito) return
    if (data.kind === 'image' && png && data.imageId) {
      store.stageImageBytes(data.imageId, png)
    }
    store.add(data, loadSettings().historyLimit)
    pushState.items()
  })
  watcher.setPaused(loadSettings().incognito)
}

export function getStore(): ItemStore {
  return store
}

export function getWatcher(): ClipboardWatcher {
  return watcher
}

/** Push the full item list (DTO) to the renderer, if it's ready. */
function send(channel: string, ...args: unknown[]): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
}

export const pushState = {
  items(): void {
    const dto: ClipboardItemDto[] = store.toDto()
    send('state:items', dto)
  },
  settings(next: Settings): void {
    send('state:settings', next)
  },
  togglePanel(): void {
    console.log('[Main] Sending window:toggle event to renderer')
    send('window:toggle')
  }
}

/** Re-export for handlers that mutate settings then need to broadcast. */
export { loadSettings, saveSettings }

/** Convenience used by IPC handlers. */
export function addFiles(paths: string[]): void {
  // Prevent duplicating items when a user accidentally drops our own staged temp files back into the app.
  // Real files are deduplicated automatically by path, but images are staged to temp-drag and would get new IDs.
  if (paths.some(p => p.startsWith(PATHS.tempDir()))) return

  const imageExts = /\.(png|jpe?g|gif|webp|bmp)$/i
  const allImages = paths.every((p) => imageExts.test(p))

  if (allImages && paths.length > 0) {
    const images = []
    for (const p of paths) {
      try {
        const img = nativeImage.createFromBuffer(readFileSync(p))
        if (!img.isEmpty()) {
          const imageId = createId()
          const png = img.toPNG()
          store.stageImageBytes(imageId, png)
          const size = img.getSize()
          images.push({ imageId, width: size.width, height: size.height, bytes: png.length })
        }
      } catch (e) {
        // ignore
      }
    }
    if (images.length > 1) {
      store.add({ kind: 'image-collection', images }, loadSettings().historyLimit)
      pushState.items()
      return
    } else if (images.length === 1) {
      store.add({ kind: 'image', ...images[0] }, loadSettings().historyLimit)
      pushState.items()
      return
    }
  }

  const data: ItemData = { kind: 'files', paths }
  store.add(data, loadSettings().historyLimit)
  pushState.items()
}
