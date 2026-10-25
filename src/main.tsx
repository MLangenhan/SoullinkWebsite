import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Schriften vom eigenen Server: keine Anfragen an Google (Datenschutz, CSP ohne fremde Quellen)
import '@fontsource-variable/bricolage-grotesque/opsz.css'
import '@fontsource-variable/dm-sans/opsz.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
