/**
 * Renderer-side access to the preload bridge.
 *
 * `window.edge` is injected by the preload script via contextBridge. We type it
 * from the shared `EdgeApi` contract so the rest of the renderer code gets full
 * autocomplete and type-safety without importing anything Electron-specific.
 */
import type { EdgeApi } from '../../shared/bridge'

declare global {
  interface Window {
    edge: EdgeApi
  }
}

/** Typed handle onto the bridge; throws early if preload didn't run. */
export const edge: EdgeApi =
  (window as unknown as { edge?: EdgeApi }).edge ??
  (() => {
    throw new Error('window.edge is missing — preload bridge did not load')
  })()
