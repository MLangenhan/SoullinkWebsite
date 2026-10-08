import { useSyncExternalStore, type MouseEvent } from 'react'

// Minimaler Router über die History-API: drei Seiten brauchen keine eigene Bibliothek.

export type Page = { name: 'home' } | { name: 'join' } | { name: 'challenge'; slug: string } | { name: 'notFound' }

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange)
  return () => window.removeEventListener('popstate', onChange)
}

function parse(pathname: string): Page {
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
  if (options.replace) window.history.replaceState(null, '', to)
  else window.history.pushState(null, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo({ top: 0 })
}

/** Link-Handler für <a>: normale Navigation ohne Neuladen, Strg/Cmd-Klick öffnet weiter ein neues Tab. */
export function linkProps(to: string) {
  return {
    href: to,
    onClick: (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
      e.preventDefault()
      navigate(to)
    },
  }
}
