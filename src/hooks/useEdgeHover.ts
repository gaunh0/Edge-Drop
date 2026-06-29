/**
 * useEdgeHover — the heart of the "invisible until you approach the edge" feel.
 *
 * The window is always full-size and normally click-through. We watch the
 * pointer across the whole document:
 *
 *   - When the cursor enters the hot band (leftmost `triggerPx` of the screen,
 *     within the vertical hot zone) and dwells there for `dwellMs`, we expand
 *     the blade and ask main to make the window interactive (no longer
 *     click-through).
 *   - When the pointer leaves the panel, we wait `graceMs` before collapsing so
 *     a slip to a child element doesn't snap it shut. Escape and blur also
 *     collapse immediately.
 *   - **Drag-aware:** when an OS file drag is active (store `dragActive`), we
 *     never schedule a close and we keep the panel interactive so the drop can
 *     land. We also listen for `dragenter`/`dragover` of OS files on the
 *     document level and immediately open + set interactive, so dragging files
 *     toward the edge reveals the shelf even when the panel was collapsed.
 *
 * Settings (hot-zone position/height) come from the store so the user can tune
 * where the trigger lives.
 */
import { useEffect, useRef } from 'react'
import { edge } from '../lib/edge'
import { useStore } from '../store/appStore'

const TRIGGER_PX = 12 // leftmost pixels that count as "the edge"
const DWELL_MS = 120 // how long the cursor must linger to open
const GRACE_MS = 250 // hide delay after leaving, to avoid jitter

export function useEdgeHover(): void {
  const open = useStore((s) => s.open)
  const setOpen = useStore((s) => s.setOpen)
  const settings = useStore((s) => s.settings)
  const dragActive = useStore((s) => s.dragActive)
  const setDragActive = useStore((s) => s.setDragActive)

  const internalDragReq = useStore((s) => s.internalDragReq)

  const openRef = useRef(open)
  openRef.current = open

  const dragActiveRef = useRef(dragActive)
  dragActiveRef.current = dragActive

  const internalDragRef = useRef(!!internalDragReq)
  internalDragRef.current = !!internalDragReq

  // Where (in px) the vertical hot zone starts and ends, recomputed per move.
  const zone = useRef({ top: 0, bottom: 0 })

  useEffect(() => {
    const recomputeZone = () => {
      const h = window.innerHeight
      const frac = settings.hotZoneHeight
      const center = 0.5
      const span = h * frac
      zone.current = {
        top: h * center - span / 2,
        bottom: h * center + span / 2
      }
    }
    recomputeZone()
    window.addEventListener('resize', recomputeZone)
    return () => window.removeEventListener('resize', recomputeZone)
  }, [settings.hotZoneHeight])

  useEffect(() => {
    let dwellTimer: number | undefined
    let graceTimer: number | undefined

    const openPanel = () => {
      if (openRef.current) return
      window.clearTimeout(graceTimer)
      window.clearTimeout(dwellTimer)
      edge.setInteractive(true)
      setOpen(true)
    }

    const scheduleClose = (immediate = false) => {
      // If an external OS file drag is in progress, never close the panel.
      if (dragActiveRef.current && !internalDragRef.current) return

      window.clearTimeout(graceTimer)
      graceTimer = window.setTimeout(() => {
        if (!openRef.current) return
        if (dragActiveRef.current && !internalDragRef.current) return // double-check after timeout
        setOpen(false)
        // Defer disabling interactivity a frame so the collapse animation can
        // run before the window becomes click-through again.
        window.setTimeout(() => edge.setInteractive(false), 220)
      }, immediate ? 0 : GRACE_MS)
    }

    const onMove = (e: PointerEvent) => {
      const { top, bottom } = zone.current
      const inEdge = e.clientX <= TRIGGER_PX
      const inZone = e.clientY >= top && e.clientY <= bottom

      if (inEdge && inZone) {
        if (!dwellTimer) {
          console.log('[EdgeHover] inEdge and inZone, starting dwell timer')
          dwellTimer = window.setTimeout(() => {
            console.log('[EdgeHover] dwell timer fired, calling openPanel')
            dwellTimer = undefined
            openPanel()
          }, DWELL_MS)
        }
      } else {
        if (dwellTimer) console.log('[EdgeHover] aborted dwell timer')
        window.clearTimeout(dwellTimer)
        dwellTimer = undefined

        // Calculate panel bounds to ensure we close if they leave the visual black area.
        const panelHeightFrac = settings.panelHeight || 0.6
        const panelHeightPx = window.innerHeight * panelHeightFrac
        const panelTop = window.innerHeight / 2 - panelHeightPx / 2
        const panelBottom = window.innerHeight / 2 + panelHeightPx / 2

        const outsideX = e.clientX > 280
        const outsideY = e.clientY < panelTop || e.clientY > panelBottom

        if (outsideX || outsideY) {
          if (!graceTimer && openRef.current) console.log(`[EdgeHover] scheduling close, outsideX=${outsideX}, outsideY=${outsideY} (clientY=${e.clientY}, top=${panelTop}, bottom=${panelBottom})`)
          scheduleClose()
        } else {
          window.clearTimeout(graceTimer)
        }
      }
    }

    const onLeave = () => scheduleClose()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openRef.current) scheduleClose()
    }

    /** Open the panel immediately when an OS file drag enters the window. */
    const onDocDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault()
        setDragActive(true)
        openPanel()
      }
    }

    const onDocDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault()
        // Keep panel alive during drag.
        window.clearTimeout(graceTimer)
      }
    }

    const onDocDragLeave = (e: DragEvent) => {
      // Only clear if we truly left the document.
      if (!e.relatedTarget) {
        setDragActive(false)
        if (internalDragRef.current) {
          scheduleClose(true)
        }
      }
    }

    const onDocDrop = () => {
      setDragActive(false)
    }

    const onDocDragEnd = () => {
      setDragActive(false)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerleave', onLeave)
    window.addEventListener('keydown', onKeyDown)
    // OS file drag awareness at the document level.
    document.addEventListener('dragenter', onDocDragEnter)
    document.addEventListener('dragover', onDocDragOver)
    document.addEventListener('dragleave', onDocDragLeave)
    document.addEventListener('drop', onDocDrop)
    document.addEventListener('dragend', onDocDragEnd)

    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('dragenter', onDocDragEnter)
      document.removeEventListener('dragover', onDocDragOver)
      document.removeEventListener('dragleave', onDocDragLeave)
      document.removeEventListener('drop', onDocDrop)
      document.removeEventListener('dragend', onDocDragEnd)
      window.clearTimeout(dwellTimer)
      window.clearTimeout(graceTimer)
    }
  }, [setOpen, setDragActive])
}
