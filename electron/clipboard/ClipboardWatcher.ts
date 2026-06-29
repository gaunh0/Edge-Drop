/**
 * Polls the system clipboard and reports genuinely new content.
 *
 * Electron has no native clipboard-changed event, so we sample on an interval.
 * To avoid creating duplicate items (and to avoid re-reading the expensive
 * image bytes every tick) we keep a cheap signature of the last seen state and
 * only do the full `readClipboard()` work when it changes.
 */
import { clipboard } from 'electron'
import { createId } from '../store/ids'
import { readClipboard, clipboardSignature } from './formats'
import type { ItemData } from '../../shared/types'

/**
 * Fired when genuinely new content lands on the clipboard. For image captures
 * the raw PNG bytes are handed over as the second argument so the store can
 * persist them without re-reading the clipboard.
 */
export type NewItemHandler = (data: ItemData, imagePng?: Buffer) => void

export class ClipboardWatcher {
  private timer: NodeJS.Timeout | null = null
  private lastSig = 'empty'
  private paused = false
  private readonly intervalMs: number

  constructor(intervalMs = 600) {
    this.intervalMs = intervalMs
  }

  /** Start watching. `onNew` fires for every genuinely new piece of content. */
  start(onNew: NewItemHandler): void {
    if (this.timer) return
    // Seed the signature so we don't re-fire for whatever is already on the
    // clipboard at startup (the user didn't "just" copy it).
    this.lastSig = clipboardSignature()

    this.timer = setInterval(() => {
      if (this.paused) return
      const sig = clipboardSignature()
      if (sig === this.lastSig) return
      console.log('[Watcher] clipboard changed sig=', sig.slice(0, 60))
      this.lastSig = sig

      const data = readClipboard()
      if (!data) {
        console.log('[Watcher] readClipboard returned null')
        return
      }
      console.log('[Watcher] detected kind=', data.kind)

      // Images need their bytes persisted + an id assigned before publishing.
      if (data.kind === 'image') {
        const img = clipboard.readImage()
        data.imageId = createId()
        data.bytes = img.toPNG().length
        onNew(data, img.toPNG())
      } else {
        onNew(data)
      }
    }, this.intervalMs)
  }

  /** Temporarily stop recording (incognito mode or self-copy) without tearing down the timer. */
  setPaused(paused: boolean): void {
    this.paused = paused
    // When resuming, refresh the signature so we ignore whatever was copied
    // during the paused state (e.g. self-copies or incognito copies).
    if (!paused) {
      this.lastSig = clipboardSignature()
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}
