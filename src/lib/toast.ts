import { useSyncExternalStore } from 'react'

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
