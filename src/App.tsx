/**
 * App — root component.
 *
 * Wires up:
 *   - hydration (load items + settings on mount)
 *   - main->renderer event subscriptions (items/settings pushed from main)
 *   - theme application (accent + reduce-motion)
 *   - the edge-hover controller (open/close the blade)
 *   - the Panel itself
 */
import { useEffect } from 'react'
import { Panel } from './components/Panel'
import { useStore } from './store/appStore'
import { edge } from './lib/edge'
import { applyReduceMotion } from './lib/theme'
import { useEdgeHover } from './hooks/useEdgeHover'

export default function App() {
  const hydrate = useStore((s) => s.hydrate)
  const setItems = useStore((s) => s.setItems)
  const setSettings = useStore((s) => s.setSettings)
  const settings = useStore((s) => s.settings)

  // Drive the edge open/close behavior.
  useEdgeHover()

  // Hydrate once + subscribe to pushed updates.
  useEffect(() => {
    void hydrate()
    const offItems = edge.onItems((items) => setItems(items))
    const offSettings = edge.onSettings((next) => setSettings(next))
    const offToggle = edge.onToggle(() => {
      const next = !useStore.getState().open
      useStore.getState().setOpen(next)
      edge.setInteractive(next)
    })
    return () => {
      offItems()
      offSettings()
      offToggle()
    }
  }, [hydrate, setItems, setSettings])

  // Apply theme whenever settings change.
  useEffect(() => {
    applyReduceMotion(settings.reduceMotion)
  }, [settings.reduceMotion])

  return <Panel />
}
