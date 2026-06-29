/**
 * Small display helpers for clipboard item previews.
 */

/** Truncate long text for list previews. */
export function previewText(text: string, max = 160): string {
  const single = text.replace(/\s+/g, ' ').trim()
  if (single.length <= max) return single
  return single.slice(0, max - 1) + '…'
}

/** Human-readable byte size. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Relative time like "just now", "3m ago", "2h ago", or a date. */
export function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const s = Math.round(diff / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}

/** Pull a filename out of a path, cross-platform. */
export function basename(p: string): string {
  const norm = p.replace(/\\/g, '/')
  const parts = norm.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? p
}

/** Is this a path to an image (by extension)? */
const IMG_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico)$/i
export function isImagePath(p: string): boolean {
  return IMG_EXT.test(p)
}
