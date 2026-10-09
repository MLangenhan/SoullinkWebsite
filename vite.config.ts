import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * Content Security Policy als <meta> (GitHub Pages kann keine eigenen HTTP-Header setzen), nur im Build:
 * Der Entwicklungsserver braucht Inline-Skripte für Hot Reload.
 *
 * - Skripte nur vom eigenen Ursprung, kein eval, keine Inline-Skripte, Trusted Types für DOM-Senken
 * - Verbindungen nur zur eigenen Seite (Pokédex-Daten) und zum Supabase-Projekt (REST und Realtime)
 * - Bilder zusätzlich von raw.githubusercontent.com (Sprites von PokeAPI)
 * - Styles inline erlaubt: Radix-Dialoge setzen beim Scroll-Sperren ein <style>-Element
 */
function contentSecurityPolicy(supabaseUrl: string | undefined): Plugin {
  const supabase = supabaseUrl ? new URL(supabaseUrl) : null
  const realtime = supabase ? `${supabase.protocol === 'https:' ? 'wss' : 'ws'}://${supabase.host}` : ''
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://raw.githubusercontent.com",
    "font-src 'self' data:",
    `connect-src 'self'${supabase ? ` ${supabase.origin} ${realtime}` : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "manifest-src 'self'",
    "worker-src 'none'",
    "require-trusted-types-for 'script'",
    ...(supabase?.protocol === 'https:' ? ['upgrade-insecure-requests'] : []),
  ].join('; ')
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }],
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    // GitHub Pages liefert die Seite unter /<Repository>/ aus; der Workflow setzt VITE_BASE entsprechend
    base: process.env.VITE_BASE ?? '/',
    plugins: [react(), tailwindcss(), contentSecurityPolicy(process.env.VITE_SUPABASE_URL ?? env.VITE_SUPABASE_URL)],
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, './src') },
    },
    build: {
      // Keine Quelltexte im Deploy; Fehler lassen sich lokal mit `vite build --sourcemap` nachvollziehen
      sourcemap: false,
    },
  }
})
