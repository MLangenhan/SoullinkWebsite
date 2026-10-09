import { useSyncExternalStore } from 'react'

/**
 * Zweisprachigkeit ohne Bibliothek: Der deutsche Text ist der Schlüssel, englische Übersetzungen liegen
 * in src/i18n/*.ts (je Bereich eine Datei, Record<deutsch, englisch>). Fehlt eine Übersetzung, bleibt
 * der deutsche Text stehen. Platzhalter: t('{name} ist im Team', { name }).
 */
export type Lang = 'de' | 'en'

const STORAGE_KEY = 'soullink.lang'

const dictionaries = import.meta.glob<{ default: Record<string, string> }>('../i18n/*.ts', { eager: true })
const EN: Record<string, string> = Object.assign({}, ...Object.values(dictionaries).map((m) => m.default))

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'de' || saved === 'en') return saved
  } catch {
    // Speicher gesperrt (privates Fenster): Browsersprache
  }
  return typeof navigator !== 'undefined' && !navigator.language.toLowerCase().startsWith('de') ? 'en' : 'de'
}

let current: Lang = initialLang()
const listeners = new Set<() => void>()
if (typeof document !== 'undefined') document.documentElement.lang = current

export function getLang(): Lang {
  return current
}

export function setLang(lang: Lang) {
  if (lang === current) return
  current = lang
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // nur für diese Sitzung
  }
  document.documentElement.lang = lang
  for (const listener of listeners) listener()
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
    () => current,
  )
}

/** Übersetzen (in der aktuellen Sprache) und Platzhalter {name} einsetzen */
export function t(text: string, vars?: Record<string, string | number>): string {
  const base = current === 'en' ? (EN[text] ?? text) : text
  return vars ? base.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match)) : base
}

/** In Komponenten: abonniert die Sprache, damit ein Wechsel neu rendert */
export function useT() {
  useLang()
  return t
}

/** Für Datum und Zahlen */
export function locale() {
  return current === 'en' ? 'en-GB' : 'de-DE'
}
