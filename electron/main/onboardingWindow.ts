import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { saveSettings, loadSettings, pushState } from './state'

let onboardingWindow: BrowserWindow | null = null

export function getOnboardingWindow(): BrowserWindow | null {
  return onboardingWindow
}

export function createOnboardingWindow(): void {
  if (onboardingWindow) {
    onboardingWindow.focus()
    return
  }

  onboardingWindow = new BrowserWindow({
    width: 800,
    height: 640,
    center: true,
    show: false,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  // Set floating always on top to ensure it covers even other always-on-top windows
  onboardingWindow.setAlwaysOnTop(true, 'normal')

  if (process.env.VITE_DEV_SERVER_URL) {
    onboardingWindow.loadURL(process.env.VITE_DEV_SERVER_URL + '#/onboarding')
  } else {
    onboardingWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'onboarding' })
  }

  onboardingWindow.once('ready-to-show', () => {
    onboardingWindow?.show()
  })

  onboardingWindow.on('closed', () => {
    onboardingWindow = null
    // If closed, consider tutorial completed
    const settings = loadSettings()
    if (!settings.tutorialCompleted) {
      const next = saveSettings({ tutorialCompleted: true })
      pushState.settings(next)
    }
  })
}

export function closeOnboardingWindow(): void {
  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    onboardingWindow.close()
  }
}
