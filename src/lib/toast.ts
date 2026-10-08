import { useSyncExternalStore } from 'react'

export interface Toast {
  id: number
  kind: 'ok' | 'error'
  text: string
}

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function toast(text: string, kind: Toast['kind'] = 'ok') {
  const id = nextId++
  toasts = [...toasts, { id, kind, text }].slice(-4)
  emit()
  setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 3500)
}

export function toastError(error: unknown) {
  toast(error instanceof Error ? error.message : 'Unbekannter Fehler', 'error')
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
