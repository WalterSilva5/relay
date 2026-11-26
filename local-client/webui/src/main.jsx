import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { applyTheme, getTheme } from './theme'
import { getSettings } from './api'
import { setLang } from './i18n'
import './styles/theme.css'

applyTheme(getTheme())

// PWA: registra o service worker (só no build de produção)
const IS_ELECTRON = /Electron/i.test(navigator.userAgent)
if (IS_ELECTRON && 'serviceWorker' in navigator) {
  // A UI é local no Electron; não deixe um service worker antigo servir bundle velho.
  const tinhaController = !!navigator.serviceWorker.controller
  navigator.serviceWorker.getRegistrations()
    .then((regs) => Promise.all(regs.map((r) => r.unregister())))
    .then(() => (window.caches ? caches.keys() : []))
    .then((keys) => Promise.all((keys || []).map((k) => caches.delete(k))))
    .then(() => {
      if (tinhaController && !sessionStorage.getItem('relay.sw.cleared')) {
        sessionStorage.setItem('relay.sw.cleared', '1')
        location.reload()
      }
    })
    .catch(() => {})
} else if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

function render() {
  createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  )
}

// Carrega o idioma da config antes de renderizar (t() usa o idioma vigente).
getSettings()
  .then((s) => setLang(s.language || 'pt'))
  .catch(() => {})
  .finally(render)
