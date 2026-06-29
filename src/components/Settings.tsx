import { useStore } from '../store/appStore'
import '../styles/settings.css'

export function Settings() {
  const settings = useStore((s) => s.settings)
  const patch = useStore((s) => s.patchSettings)

  return (
    <div className="settings-body" style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' }}>
      <h2 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 20, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Preferences</h2>
      
      <Field label={`Trigger area height — ${Math.round(settings.hotZoneHeight * 100)}%`}>
        <input
          type="range"
          min={0.2}
          max={0.8}
          step={0.05}
          value={settings.hotZoneHeight}
          onChange={(e) => patch({ hotZoneHeight: Number(e.target.value) })}
        />
      </Field>

      <Field label={`Complete pop-up panel size — ${Math.round((settings.panelHeight || 0.6) * 100)}%`}>
        <input
          type="range"
          min={0.4}
          max={0.9}
          step={0.05}
          value={settings.panelHeight || 0.6}
          onChange={(e) => patch({ panelHeight: Number(e.target.value) })}
        />
      </Field>

              <Field label={`History limit — ${settings.historyLimit} items`}>
                <input
                  type="range"
                  min={50}
                  max={2000}
                  step={50}
                  value={settings.historyLimit}
                  onChange={(e) => patch({ historyLimit: Number(e.target.value) })}
                />
              </Field>

              <Toggle
                label="Incognito (pause capture)"
                checked={settings.incognito}
                onChange={(v) => patch({ incognito: v })}
              />
              <Toggle
                label="Reduce motion"
                checked={settings.reduceMotion}
                onChange={(v) => patch({ reduceMotion: v })}
              />
              <Toggle
                label="Launch at login"
                checked={settings.launchAtLogin}
                onChange={(v) => patch({ launchAtLogin: v })}
              />
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}

function Toggle({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="toggle-row" onClick={() => onChange(!checked)}>
      <span>{label}</span>
      <button className={`toggle${checked ? ' on' : ''}`} role="switch" aria-checked={checked}>
        <span className="knob" />
      </button>
    </div>
  )
}
