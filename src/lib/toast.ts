import { useSyncExternalStore } from 'react'
import { t } from '@/lib/i18n'

export interface Toast {
  id: number
  kind: 'ok' | 'error' | 'info'
  text: string
  action?: { label: string; run: () => void }
}

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function toast(
  text: string,
  kind: Toast['kind'] = 'ok',
  options: { action?: Toast['action']; duration?: number } = {},
) {
  const id = nextId++
  toasts = [...toasts, { id, kind, text, action: options.action }].slice(-4)
  emit()
  setTimeout(() => dismiss(id), options.duration ?? (kind === 'ok' ? 3500 : 6000))
}

// Meldungen der Datenbank mit eingesetzten Werten (format('Feld "%s" fehlt', k) usw.)
const PATTERNS: [RegExp, string, string[]][] = [
  [/^Feld "(.+)" fehlt$/, 'Feld "{field}" fehlt', ['field']],
  [/^Feld "(.+)" ist länger als (\d+) Zeichen$/, 'Feld "{field}" ist länger als {max} Zeichen', ['field', 'max']],
  [/^Feld "(.+)" muss Text sein$/, 'Feld "{field}" muss Text sein', ['field']],
  [/^Feld "(.+)" muss eine UUID sein$/, 'Feld "{field}" muss eine UUID sein', ['field']],
  [/^Feld "(.+)" muss eine Zahl sein$/, 'Feld "{field}" muss eine Zahl sein', ['field']],
  [
    /^Feld "(.+)" muss eine ganze Zahl zwischen (-?\d+) und (-?\d+) sein$/,
    'Feld "{field}" muss eine ganze Zahl zwischen {min} und {max} sein',
    ['field', 'min', 'max'],
  ],
  [/^Unbekanntes Pokémon #(\d+)$/, 'Unbekanntes Pokémon #{id}', ['id']],
]

/** Deutsche Fehlermeldung (auch aus der Datenbank) in die eingestellte Sprache übersetzen */
export function translateError(message: string): string {
  for (const [pattern, key, names] of PATTERNS) {
    const match = pattern.exec(message)
    if (match) return t(key, Object.fromEntries(names.map((name, i) => [name, match[i + 1]])))
  }
  return t(message)
}

export function toastError(error: unknown) {
  toast(error instanceof Error ? translateError(error.message) : t('Unbekannter Fehler'), 'error')
}

export function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function useToasts() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => toasts,
    () => toasts,
  )
}
