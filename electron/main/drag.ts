/**
 * Native drag-out of items into other applications.
 *
 * Electron's supported drag-out path is `webContents.startDrag({ file, icon })`,
 * which must be called from the `ipcMain.on` handler (not an async invoke
 * handler) so `event.sender` is the exact webContents that initiated the drag.
 * This ensures the OLE drag gesture flows correctly on Windows.
 *
 * Before dragging we stage the item's content as a temp file:
 *   - image  -> <id>.png (its persisted bytes, copied to temp)
 *   - text   -> <id>.txt
 *   - files  -> the *original* file paths (drag the real thing, not a copy)
 *
 * The temp files are cleaned up on the next app start (see cleanTemp).
 */
import { nativeImage, type WebContents } from 'electron'
import { copyFileSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PATHS } from '../store/paths'
import type { DragRequest, ItemData } from '../../shared/types'
import { getStore } from './state'

/**
 * Resolve a DragRequest into concrete ItemData.
 *
 * If `paths` is provided (dragging one file out of an expanded bundle), synthesize
 * a singleton `files` item. Otherwise look up the full item by id.
 */
export function resolveDragData(req: DragRequest): ItemData | null {
  if (req.paths && req.paths.length > 0) {
    return { kind: 'files', paths: req.paths }
  }
  const item = getStore().get(req.id)
  if (!item) return null
  
  if (req.imageId && item.data.kind === 'image-collection') {
    const img = item.data.images.find((i) => i.imageId === req.imageId)
    if (img) return { kind: 'image', ...img }
  }
  return item.data
}

/**
 * Begin a native OS drag from a specific webContents (the `event.sender` from
 * the `ipcMain.on` handler). This is the **only** reliable way to start a drag
 * on Windows — `BrowserWindow.getFocusedWindow()` often returns null for this
 * edge panel (it is showInactive / skipTaskbar / alwaysOnTop).
 */
export function startDragOut(sender: WebContents, data: ItemData): void {
  const staged = stageDragFile(data)
  if (!staged) return

  const item: Electron.Item = { file: staged.file, icon: dragIcon(data) }
  if (staged.files) item.files = staged.files
  sender.startDrag(item)
}

/* ------------------------------------------------------------------ */
/* Staging                                                             */
/* ------------------------------------------------------------------ */

interface Staged {
  file: string
  files?: string[]
}

/** Resolve the item to a concrete file path to hand to the OS. */
function stageDragFile(data: ItemData): Staged | null {
  const temp = PATHS.tempDir()
  switch (data.kind) {
    case 'files': {
      const real = data.paths.filter((p) => existsSync(p))
      if (!real.length) return null
      return { file: real[0], files: real }
    }
    case 'image': {
      const src = join(PATHS.imagesDir(), `${data.imageId}.png`)
      if (!existsSync(src)) return null
      const dest = join(temp, `${data.imageId}.png`)
      try {
        copyFileSync(src, dest)
      } catch {
        return null
      }
      return { file: dest }
    }
    case 'image-collection': {
      const paths: string[] = []
      for (const img of data.images) {
        const src = join(PATHS.imagesDir(), `${img.imageId}.png`)
        if (existsSync(src)) {
          const dest = join(temp, `${img.imageId}.png`)
          try {
            copyFileSync(src, dest)
            paths.push(dest)
          } catch {
            // skip failed copies
          }
        }
      }
      if (!paths.length) return null
      return { file: paths[0], files: paths }
    }
    case 'text': {
      const id = `${Date.now().toString(36)}`
      const dest = join(temp, `${id}.txt`)
      try {
        writeFileSync(dest, data.text, 'utf8')
      } catch {
        return null
      }
      return { file: dest }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Drag icon (with small in-memory cache)                              */
/* ------------------------------------------------------------------ */

/** Cache recently built drag icons to avoid re-reading + re-encoding images. */
const iconCache = new Map<string, Electron.NativeImage>()
const ICON_CACHE_MAX = 32

/**
 * Build the ghost image shown under the cursor during the drag. We render a
 * rounded tile at a small size; for images we use a thumbnail of the content.
 */
function dragIcon(data: ItemData): Electron.NativeImage {
  try {
    if (data.kind === 'image' || data.kind === 'image-collection') {
      const imageId = data.kind === 'image-collection' && data.images.length > 0 
        ? data.images[0].imageId 
        : (data as any).imageId
        
      if (!imageId) return nativeImage.createEmpty()

      const cached = iconCache.get(imageId)
      if (cached && !cached.isEmpty()) return cached

      const src = join(PATHS.imagesDir(), `${imageId}.png`)
      if (existsSync(src)) {
        const img = nativeImage.createFromBuffer(readFileSync(src)).resize({ width: 120, quality: 'good' })
        iconCache.set(imageId, img)
        // Evict oldest entries if the cache is too large.
        if (iconCache.size > ICON_CACHE_MAX) {
          const first = iconCache.keys().next().value
          if (first) iconCache.delete(first)
        }
        return img
      }
    }
  } catch {
    /* fall through to default */
  }
  return nativeImage.createEmpty()
}
