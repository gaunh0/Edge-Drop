/**
 * In-memory + on-disk store for clipboard history.
 *
 * Responsibilities:
 *   - Keep an ordered list (most recent first) of ClipboardItem.
 *   - Deduplicate by content signature so re-copies bump `hitCount` instead of
 *     adding a clone.
 *   - Enforce a size cap, evicting the oldest *unpinned* items.
 *   - Persist the index to JSON and image bytes to per-item PNG files.
 *   - Convert internal items to the serializable DTO form for the renderer.
 */
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  type ClipboardItem,
  type ClipboardItemDto,
  type ItemData
} from '../../shared/types'
import { PATHS } from './paths'
import { createId } from './ids'

/** Stable, content-based key used for deduplication. */
function signature(data: ItemData): string {
  switch (data.kind) {
    case 'text':
      return `text|${data.text}`
    case 'image':
      return `image|${data.imageId}`
    case 'image-collection':
      return `image-collection|${data.images.map((i) => i.imageId).join(',')}`
    case 'files':
      return `files|${data.paths.join('\n')}`
  }
}

/** Maps a signature -> item id so dedup is O(1). */
interface Index {
  items: ClipboardItem[]
}

export class ItemStore {
  private items: ClipboardItem[] = []
  private sigToId = new Map<string, string>()

  /** Load persisted state from disk. Called once at startup. */
  load(): void {
    try {
      if (existsSync(PATHS.indexFile())) {
        const raw = JSON.parse(readFileSync(PATHS.indexFile(), 'utf8')) as Index
        if (Array.isArray(raw?.items)) {
          this.items = raw.items.filter((it) => it && it.data && typeof it.id === 'string')
          this.rebuildIndex()
        }
      }
    } catch {
      this.items = []
      this.sigToId.clear()
    }
  }

  private rebuildIndex(): void {
    this.sigToId.clear()
    for (const it of this.items) this.sigToId.set(signature(it.data), it.id)
  }

  /** Persist the current index to disk. Called after every mutation. */
  private persist(): void {
    try {
      writeFileSync(PATHS.indexFile(), JSON.stringify({ items: this.items } satisfies Index, null, 2), 'utf8')
    } catch {
      /* persistence failures are non-fatal; state stays in memory */
    }
  }

  /**
   * Enforce the size cap by evicting oldest *unpinned* items. Walks from the
   * tail (oldest) forward, skipping anything pinned so favorites survive.
   */
  private trim(limit: number): void {
    if (this.items.length <= limit) return
    const need = this.items.length - limit
    const survivors: ClipboardItem[] = []
    let stillNeed = need
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]
      if (stillNeed > 0 && !it.pinned) {
        this.sigToId.delete(signature(it.data))
        if (it.data.kind === 'image') this.removeImageFile(it.data.imageId)
        if (it.data.kind === 'image-collection') {
          it.data.images.forEach((img) => this.removeImageFile(img.imageId))
        }
        stillNeed--
      } else {
        survivors.unshift(it)
      }
    }
    this.items = survivors
  }

  /**
   * Add or refresh a piece of content.
   * Returns true if the list actually changed (so callers can decide to push).
   */
  add(data: ItemData, limit: number): boolean {
    const sig = signature(data)
    const existingId = this.sigToId.get(sig)
    const now = Date.now()

    if (existingId) {
      const idx = this.items.findIndex((it) => it.id === existingId)
      if (idx >= 0) {
        const it = this.items[idx]
        // Bump count and move to front (unless pinned keeps its own group).
        const updated: ClipboardItem = { ...it, hitCount: it.hitCount + 1, capturedAt: now }
        this.items.splice(idx, 1)
        this.items.unshift(updated)
        this.persist()
        return true
      }
    }

    const id = createId()
    const item: ClipboardItem = { id, data, capturedAt: now, hitCount: 1, pinned: false }
    this.items.unshift(item)
    this.sigToId.set(sig, id)
    if (data.kind === 'image') this.writeImageFile(data.imageId)
    this.trim(limit)
    this.persist()
    return true
  }

  setPinned(id: string, pinned: boolean): void {
    const it = this.items.find((x) => x.id === id)
    if (!it) return
    it.pinned = pinned
    this.persist()
  }

  delete(id: string): void {
    const idx = this.items.findIndex((x) => x.id === id)
    if (idx < 0) return
    const [removed] = this.items.splice(idx, 1)
    this.sigToId.delete(signature(removed.data))
    if (removed.data.kind === 'image') this.removeImageFile(removed.data.imageId)
    if (removed.data.kind === 'image-collection') {
      removed.data.images.forEach((img) => this.removeImageFile(img.imageId))
    }
    this.persist()
  }

  merge(sourceId: string, targetId: string): boolean {
    if (sourceId === targetId) return false
    const srcIdx = this.items.findIndex(x => x.id === sourceId)
    const tgtIdx = this.items.findIndex(x => x.id === targetId)
    if (srcIdx < 0 || tgtIdx < 0) return false

    const src = this.items[srcIdx]
    const tgt = this.items[tgtIdx]

    // Determine how to merge based on kinds
    // 1. Files + Files -> Files
    // 2. Image(s) + Image(s) -> Image Collection
    // Mixing files and images: fall back to Files (by converting images to paths? No, they don't have paths yet unless they are temp files. We'll just reject cross-type merges for now, or just merge if same type).
    
    let newData: ItemData | null = null

    const srcIsImage = src.data.kind === 'image' || src.data.kind === 'image-collection'
    const tgtIsImage = tgt.data.kind === 'image' || tgt.data.kind === 'image-collection'

    if (srcIsImage && tgtIsImage) {
      const srcImages = src.data.kind === 'image' ? [src.data] : src.data.images
      const tgtImages = tgt.data.kind === 'image' ? [tgt.data] : tgt.data.images
      // Filter out exact duplicate imageIds just in case
      const seen = new Set(tgtImages.map(i => i.imageId))
      const combined = [...tgtImages, ...srcImages.filter(i => !seen.has(i.imageId))]
      newData = { kind: 'image-collection', images: combined }
    } else if (src.data.kind === 'files' && tgt.data.kind === 'files') {
      const seen = new Set(tgt.data.paths)
      const combined = [...tgt.data.paths, ...src.data.paths.filter(p => !seen.has(p))]
      newData = { kind: 'files', paths: combined }
    }

    if (!newData) return false

    // Update target item
    this.sigToId.delete(signature(tgt.data))
    tgt.data = newData
    this.sigToId.set(signature(newData), tgt.id)
    tgt.capturedAt = Date.now() // bump time

    // Remove source item completely but DO NOT delete its underlying files/images 
    // because they are now owned by the target!
    const [removed] = this.items.splice(srcIdx, 1)
    this.sigToId.delete(signature(removed.data))
    
    this.persist()
    return true
  }

  public removeSubitem(req: DragRequest): boolean {
    const sourceItem = this.get(req.id)
    if (!sourceItem) return false
    const sourceIndex = this.items.findIndex(i => i.id === req.id)
    if (sourceIndex === -1) return false

    if (sourceItem.data.kind === 'image-collection' && req.imageId) {
      const imgIdx = sourceItem.data.images.findIndex(i => i.imageId === req.imageId)
      if (imgIdx === -1) return false
      
      sourceItem.data.images.splice(imgIdx, 1)
      
      if (sourceItem.data.images.length === 1) {
        sourceItem.data = { kind: 'image', ...sourceItem.data.images[0] }
      } else if (sourceItem.data.images.length === 0) {
        this.items.splice(sourceIndex, 1)
      }
      this.rebuildIndex()
      this.persist()
      return true
    }

    if (req.paths && req.paths.length > 0 && sourceItem.data.kind === 'files') {
      const targetPaths = req.paths
      sourceItem.data.paths = sourceItem.data.paths.filter(p => !targetPaths.includes(p))
      
      if (sourceItem.data.paths.length === 0) {
        this.items.splice(sourceIndex, 1)
      }
      this.rebuildIndex()
      this.persist()
      return true
    }

    return false
  }

  public split(req: DragRequest): boolean {
    const sourceItem = this.get(req.id)
    if (!sourceItem) return false
    const sourceIndex = this.items.findIndex(i => i.id === req.id)
    if (sourceIndex === -1) return false

    // Splitting from an image collection
    if (sourceItem.data.kind === 'image-collection' && req.imageId) {
      const imgIdx = sourceItem.data.images.findIndex(i => i.imageId === req.imageId)
      if (imgIdx === -1) return false
      
      const targetImg = sourceItem.data.images[imgIdx]
      sourceItem.data.images.splice(imgIdx, 1)
      
      if (sourceItem.data.images.length === 1) {
        sourceItem.data = { kind: 'image', ...sourceItem.data.images[0] }
      } else if (sourceItem.data.images.length === 0) {
        this.items.splice(sourceIndex, 1)
      }

      const newItem: ClipboardItem = {
        id: createId(),
        capturedAt: Date.now(),
        hitCount: 1,
        pinned: false,
        data: { kind: 'image', imageId: targetImg.imageId, width: targetImg.width, height: targetImg.height }
      }
      this.items.splice(req.splitPlacement === 'after' ? sourceIndex + 1 : sourceIndex, 0, newItem)
      this.rebuildIndex()
      this.persist()
      return true
    }

    // Splitting from a file collection
    if (req.paths && req.paths.length > 0 && sourceItem.data.kind === 'files') {
      const sourcePaths = sourceItem.data.paths
      const targetPaths = req.paths
      
      sourceItem.data.paths = sourcePaths.filter(p => !targetPaths.includes(p))
      
      if (sourceItem.data.paths.length === 0) {
        this.items.splice(sourceIndex, 1)
      }

      const newItem: ClipboardItem = {
        id: createId(),
        capturedAt: Date.now(),
        hitCount: 1,
        pinned: false,
        data: { kind: 'files', paths: targetPaths }
      }
      this.items.splice(req.splitPlacement === 'after' ? sourceIndex + 1 : sourceIndex, 0, newItem)
      this.rebuildIndex()
      this.persist()
      return true
    }

    return false
  }

  clearUnpinned(): void {
    const kept: ClipboardItem[] = []
    for (const it of this.items) {
      if (it.pinned) kept.push(it)
      else {
        this.sigToId.delete(signature(it.data))
        if (it.data.kind === 'image') this.removeImageFile(it.data.imageId)
        if (it.data.kind === 'image-collection') {
          it.data.images.forEach((img) => this.removeImageFile(img.imageId))
        }
      }
    }
    this.items = kept
    this.persist()
  }

  get(id: string): ClipboardItem | undefined {
    return this.items.find((x) => x.id === id)
  }

  list(): readonly ClipboardItem[] {
    return this.items
  }

  /* ----------------------------- image files ----------------------------- */

  /** Read image bytes from disk as a data URL for the renderer. */
  imageToDataUrl(imageId: string): string | null {
    try {
      const buf = readFileSync(this.imagePath(imageId))
      return 'data:image/png;base64,' + buf.toString('base64')
    } catch {
      return null
    }
  }

  /**
   * Stage an image's bytes from a clipboard capture. The image was already
   * written to userData/images by the clipboard watcher (which has the raw
   * nativeImage); here we just no-op because the file already exists.
   * Kept for symmetry / future use.
   */
  private writeImageFile(_imageId: string): void {
    /* no-op: bytes already on disk from capture */
  }

  private imagePath(imageId: string): string {
    return join(PATHS.imagesDir(), `${imageId}.png`)
  }

  private removeImageFile(imageId: string): void {
    try {
      rmSync(this.imagePath(imageId), { force: true })
    } catch {
      /* ignore */
    }
  }

  /* ------------------------------- DTO ----------------------------------- */

  /** Snapshot the whole list as renderer-safe DTOs (images inlined). */
  toDto(): ClipboardItemDto[] {
    return this.items.map((it) => {
      if (it.data.kind === 'image') {
        const { kind, imageId, width, height, bytes } = it.data
        return {
          ...it,
          data: { kind, imageId, width, height, bytes, preview: this.imageToDataUrl(imageId) ?? '' }
        }
      }
      if (it.data.kind === 'image-collection') {
        const imagesWithPreviews = it.data.images.map((img) => ({
          ...img,
          preview: this.imageToDataUrl(img.imageId) ?? ''
        }))
        return {
          ...it,
          data: { kind: 'image-collection', images: imagesWithPreviews }
        }
      }
      if (it.data.kind === 'files') {
        // Generate inline previews for image files (first 4 only to cap size).
        const previews = it.data.paths
          .filter((p) => isImageExt(p))
          .slice(0, 4)
          .map((p) => fileToDataUrl(p))
        if (previews.some(Boolean)) {
          return { ...it, data: { ...it.data, previews } }
        }
      }
      return { ...it, data: it.data }
    })
  }

  /** Persist a brand-new image captured from the clipboard to its PNG file. */
  stageImageBytes(imageId: string, png: Buffer): void {
    try {
      writeFileSync(this.imagePath(imageId), png)
    } catch {
      /* ignore */
    }
  }
}

/** Check if a file path points to an image by extension. */
function isImageExt(p: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico)$/i.test(p)
}

/** Read a file from disk as a data URL (used for image-file previews). */
function fileToDataUrl(p: string): string {
  try {
    const buf = readFileSync(p)
    const ext = p.split('.').pop()?.toLowerCase() ?? 'png'
    const mime = ext === 'svg' ? 'image/svg+xml'
      : ext === 'gif' ? 'image/gif'
      : ext === 'webp' ? 'image/webp'
      : ext === 'bmp' ? 'image/bmp'
      : 'image/png'
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    return ''
  }
}
