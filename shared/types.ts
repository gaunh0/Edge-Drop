/**
 * Shared domain types used by both the Electron main process and the renderer.
 *
 * Items are serialized in two places:
 *   - the on-disk index (JSON in userData)
 *   - the IPC payloads sent to the renderer
 * Images are stored as separate PNG files referenced by `imageId`, while the
 * renderer receives the bytes inline as a data URL so the UI never blocks on disk I/O.
 */

/** Discriminated union describing the payload of a clipboard item. */
export type ItemData =
  | { kind: 'text'; text: string; html?: string; isUrl: boolean; isColor?: boolean }
  | { kind: 'image'; imageId: string; width: number; height: number; bytes: number }
  | { kind: 'image-collection'; images: { imageId: string; width: number; height: number; bytes: number }[] }
  | { kind: 'files'; paths: string[] }

export type ItemKind = ItemData['kind']

/**
 * A single clipboard entry. `id` is stable across the lifetime of the entry;
 * it is used as the React key and the storage key for pinned/persisted items.
 */
export interface ClipboardItem {
  id: string
  data: ItemData
  /** Unix epoch ms of the moment the item was captured. */
  capturedAt: number
  /** Number of times this exact content has been captured. */
  hitCount: number
  /** Pinned items never scroll off and survive app restarts. */
  pinned: boolean
}

/** Payload sent over IPC: same as ClipboardItem but with inline image previews. */
export interface ClipboardItemDto extends Omit<ClipboardItem, 'data'> {
  data:
  | { kind: 'text'; text: string; html?: string; isUrl: boolean; isColor?: boolean }
  | { kind: 'image'; imageId: string; width: number; height: number; bytes: number; preview: string }
  | { kind: 'image-collection'; images: { imageId: string; width: number; height: number; bytes: number; preview: string }[] }
  | { kind: 'files'; paths: string[]; previews?: string[] }
}

/** Section the renderer groups items into. */
export type ItemSection = 'pinned' | 'shelf'

/**
 * Request to begin a native OS drag-out of one item.
 *
 * `id` always identifies the source item. `paths` is an optional override that
 * narrows a `files` bundle to a single path (used when dragging one file out of
 * an expanded bundle). When omitted, main uses all of the item's content.
 */
export interface DragRequest {
  id: string
  paths?: string[]
  imageId?: string
  splitPlacement?: 'before' | 'after'
}

export interface Settings {
  /** Fraction of the screen height the hot zone occupies (0.2 - 0.6). */
  hotZoneHeight: number
  /** Maximum number of unpinned history items kept. */
  historyLimit: number
  /** Fraction of the screen height the panel occupies (0.4 - 1.0). */
  panelHeight: number
  /** When true, newly captured items are not recorded. */
  incognito: boolean
  /** Start minimized when the OS logs in. */
  launchAtLogin: boolean
  /** Reduce motion for the panel animations. */
  reduceMotion: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  hotZoneHeight: 0.25,
  historyLimit: 500,
  panelHeight: 0.5,
  incognito: false,
  launchAtLogin: false,
  reduceMotion: false
}


