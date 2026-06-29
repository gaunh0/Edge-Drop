/** React entry — mounts <App/> and pulls in all stylesheet layers. */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

// Stylesheet order matters: tokens first, then globals, then components.
import './styles/tokens.css'
import './styles/global.css'
import './styles/panel.css'
import './styles/item.css'
import './styles/settings.css'

const container = document.getElementById('root')
if (!container) throw new Error('#root element not found')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
