/**
 * ItemList — the scrollable body of the blade.
 *
 * Renders Pinned (if any) and Recent sections, handles OS drag-in of files &
 * images onto the shelf, and shows the empty state when there's nothing.
 * AnimatePresence here gives items their staggered enter/exit.
 *
 * Drag-in awareness: sets `dragActive` on the store while OS files are being
 * dragged over the panel so the edge-hover hook knows not to close mid-drag.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useRef, useEffect, useState } from 'react'
import { useStore } from '../store/appStore'
import { useFilteredItems } from '../hooks/useFilteredItems'
import { ClipboardItemCard } from './ClipboardItem'
import { EmptyState } from './EmptyState'

export function ItemList() {
  const { pinned, recent } = useFilteredItems()
  const query = useStore((s) => s.query)
  const listRef = useRef<HTMLDivElement>(null)

  const total = pinned.length + recent.length
  
  const dragActive = useStore((s) => s.dragActive)
  const internalDragReq = useStore((s) => s.internalDragReq)
  
  const [showScrollTop, setShowScrollTop] = useState(false)
  
  const firstItemId = (pinned[0] || recent[0])?.id
  const prevFirstItemId = useRef(firstItemId)
  const prevTotal = useRef(total)

  const scrollRaf = useRef<number | null>(null)
  const scrollVelocity = useRef<number>(0)

  useEffect(() => {
    return () => {
      if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current)
    }
  }, [])

  useEffect(() => {
    // If the first item changed and the total didn't decrease, a new item was likely added (copied/split).
    if (firstItemId !== prevFirstItemId.current && total >= prevTotal.current) {
      if (listRef.current) {
        listRef.current.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }
    prevFirstItemId.current = firstItemId
    prevTotal.current = total
  }, [firstItemId, total])

  useEffect(() => {
    if (!dragActive && !internalDragReq) {
      stopScrolling()
    }
  }, [dragActive, internalDragReq])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop > 50) {
      setShowScrollTop(true)
    } else {
      setShowScrollTop(false)
    }
  }

  const scrollToTop = () => {
    if (listRef.current) {
      listRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const startScrolling = () => {
    if (scrollRaf.current !== null) return

    let lastTime = performance.now()
    const loop = (time: number) => {
      const dt = time - lastTime
      lastTime = time

      if (listRef.current && scrollVelocity.current !== 0) {
        // Apply velocity, scaled by delta time to keep it consistent across refresh rates
        listRef.current.scrollTop += scrollVelocity.current * (dt / 16)
        scrollRaf.current = requestAnimationFrame(loop)
      } else {
        scrollRaf.current = null
      }
    }
    scrollRaf.current = requestAnimationFrame(loop)
  }

  const stopScrolling = () => {
    scrollVelocity.current = 0
    if (scrollRaf.current !== null) {
      cancelAnimationFrame(scrollRaf.current)
      scrollRaf.current = null
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (!listRef.current) return
    const rect = listRef.current.getBoundingClientRect()
    const y = e.clientY - rect.top
    const edgeSize = 80 // slightly larger comfortable trigger zone

    if (y < edgeSize) {
      // Speed scales up as you get closer to the absolute edge
      const intensity = Math.max(0, 1 - (y / edgeSize))
      scrollVelocity.current = -(intensity * 20 + 2)
      startScrolling()
    } else if (y > rect.height - edgeSize) {
      const intensity = Math.max(0, 1 - ((rect.height - y) / edgeSize))
      scrollVelocity.current = (intensity * 20 + 2)
      startScrolling()
    } else {
      stopScrolling()
    }
  }

  const handleDragLeaveOrDrop = () => {
    stopScrolling()
  }

  return (
    <div 
      className="list" 
      ref={listRef} 
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeaveOrDrop}
      onDrop={handleDragLeaveOrDrop}
      onScroll={handleScroll}
    >
      {total === 0 ? (
        <EmptyState filtered={query.trim().length > 0} />
      ) : (
        <>
          {pinned.length > 0 && (
            <section>
              <div className="section-label">Pinned</div>
              <AnimatePresence initial={false}>
                {pinned.map((it) => (
                  <ClipboardItemCard key={it.id} item={it} />
                ))}
              </AnimatePresence>
            </section>
          )}

          {recent.length > 0 && (
            <section>
              {pinned.length > 0 && <div className="section-label">Recent</div>}
              <AnimatePresence initial={false}>
                {recent.map((it) => (
                  <ClipboardItemCard key={it.id} item={it} />
                ))}
              </AnimatePresence>
            </section>
          )}
        </>
      )}

      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            className="scroll-top-btn"
            onClick={scrollToTop}
            title="Scroll to top"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
