import { useSyncExternalStore, type MouseEvent } from 'react'

// Minimaler Router über die History-API: drei Seiten brauchen keine eigene Bibliothek.
// Alle Pfade im Code sind relativ zur App ("/c/abc"); der Basis-Pfad (z. B. "/SoullinkWebsite/" auf
// GitHub Pages, siehe vite.config.ts) wird hier ergänzt bzw. entfernt.

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

/** App-Pfad → echte Adresse inkl. Basis-Pfad */
export function withBase(path: string) {
  return `${BASE}${path.startsWith('/') ? path : `/${path}`}`
}

function stripBase(pathname: string) {
  return BASE && pathname.startsWith(BASE) ? pathname.slice(BASE.length) || '/' : pathname
}

export type Page = { name: 'home' } | { name: 'join' } | { name: 'challenge'; slug: string } | { name: 'notFound' }

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange)
  return () => window.removeEventListener('popstate', onChange)
}

function parse(fullPath: string): Page {
  const pathname = stripBase(fullPath)
  if (pathname === '/' || pathname === '') return { name: 'home' }
  if (pathname === '/join') return { name: 'join' }
  const match = /^\/c\/([a-z0-9-]{3,40})\/?$/.exec(pathname)
  if (match) return { name: 'challenge', slug: match[1] }
  return { name: 'notFound' }
}

let current = { path: '', page: parse('/') as Page }
function snapshot() {
  if (current.path !== window.location.pathname) {
    current = { path: window.location.pathname, page: parse(window.location.pathname) }
  }
  return current.page
}

export function usePage(): Page {
  return useSyncExternalStore(subscribe, snapshot, () => current.page)
}

export function navigate(to: string, options: { replace?: boolean } = {}) {
  if (options.replace) window.history.replaceState(null, '', withBase(to))
  else window.history.pushState(null, '', withBase(to))
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo({ top: 0 })
}

/** Link-Handler für <a>: normale Navigation ohne Neuladen, Strg/Cmd-Klick öffnet weiter ein neues Tab. */
export function linkProps(to: string) {
  return {
    href: withBase(to),
    onClick: (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
      e.preventDefault()
      navigate(to)
    },
  }
}
