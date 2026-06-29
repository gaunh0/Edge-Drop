/** Panel header: animated search + settings toggle. */
import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store/appStore'
import { GearIcon, SearchIcon, CloseIcon } from './icons'

export function Header() {
  const query = useStore((s) => s.query)
  const setQuery = useStore((s) => s.setQuery)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const settingsOpen = useStore((s) => s.settingsOpen)

  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isSearchOpen) {
      inputRef.current?.focus()
    } else {
      setQuery('')
    }
  }, [isSearchOpen, setQuery])

  return (
    <div className="header" style={{ display: 'flex', gap: 10, width: '100%', alignItems: 'center' }}>
      <motion.div
        layout
        className="search-container"
        style={{
          display: 'flex',
          background: 'var(--bg-2)',
          borderRadius: 999,
          height: 30,
          overflow: 'hidden',
          flex: isSearchOpen ? 1 : 'none',
          width: isSearchOpen ? 'auto' : 30
        }}
        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
      >
        <button
          onClick={() => setIsSearchOpen(true)}
          style={{ width: 30, height: 30, background: 'transparent', border: 'none', color: 'var(--text-secondary)', display: 'grid', placeItems: 'center', flexShrink: 0, cursor: 'pointer' }}
        >
          <SearchIcon width={14} height={14} />
        </button>
        <AnimatePresence>
          {isSearchOpen && (
            <motion.input
              ref={inputRef}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              type="text"
              placeholder="Search clipboard..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onBlur={() => { if (!query) setIsSearchOpen(false) }}
              style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', paddingRight: 10 }}
              spellCheck={false}
            />
          )}
        </AnimatePresence>
      </motion.div>

      <motion.div layout style={{ flex: isSearchOpen ? 0 : 1 }} />

      <motion.button
        layout
        className={`icon-btn${settingsOpen ? ' active' : ''}`}
        title={settingsOpen ? 'Close Settings' : 'Settings'}
        onClick={() => setSettingsOpen(!settingsOpen)}
        style={{ color: settingsOpen ? 'var(--accent)' : undefined, flexShrink: 0 }}
      >
        {settingsOpen ? <CloseIcon /> : <GearIcon />}
      </motion.button>
    </div>
  )
}
