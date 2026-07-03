/** Panel header: title + settings toggle. */
import { motion } from 'framer-motion'
import { useStore } from '../store/appStore'
import { GearIcon, CloseIcon } from './icons'

export function Header() {
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const settingsOpen = useStore((s) => s.settingsOpen)

  return (
    <div className="header" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', height: 40, padding: '0 14px 0 6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 6 }}>
        <img
          src="./logo-white.png"
          alt="Edge-Drop"
          style={{
            height: 20,
            width: 'auto',
            objectFit: 'contain',
            userSelect: 'none',
            pointerEvents: 'none',
            display: 'block',
            imageRendering: 'auto'
          }}
        />
        {settingsOpen && (
          <span style={{ fontSize: 13, fontWeight: 600, color: '#8e8e93', letterSpacing: '0.01em' }}>
            / Settings
          </span>
        )}
      </div>

      <motion.button
        type="button"
        layout
        className={`icon-btn${settingsOpen ? ' active' : ''}`}
        title={settingsOpen ? 'Close Settings' : 'Settings'}
        onClick={() => setSettingsOpen(!settingsOpen)}
        style={{
          color: '#ffffff',
          background: 'transparent',
          border: 'none',
          boxShadow: 'none',
          flexShrink: 0,
          cursor: 'pointer',
          width: 32,
          height: 32,
          display: 'grid',
          placeItems: 'center'
        }}
      >
        {settingsOpen ? <CloseIcon /> : <GearIcon />}
      </motion.button>
    </div>
  )
}
