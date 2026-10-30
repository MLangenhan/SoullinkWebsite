import { useEffect, useRef, useState } from 'react'
import { mergePayload, overlayDeviceId, type OverlayData, type OverlayPayload } from '@/lib/overlay'
import { ApiError, rpc } from '@/lib/supabase'

/** Abfrage-Takt: OBS-Browserquellen haben keine Sitzung und damit kein Realtime, also wird nachgefragt */
export const POLL_MS = 4000
const RETRY_INVALID_MS = 30000

export type OverlayState =
  | { status: 'loading' }
  | { status: 'invalid' }
  /** Link ist an ein anderes Gerät gebunden */
  | { status: 'locked' }
  | { status: 'ready'; data: OverlayData; stale: boolean }

/**
 * Stand eines Overlays über overlay_state. Jede Abfrage schickt die bekannte Version mit; hat sich nichts
 * geändert, antwortet die Datenbank nur mit der Version. Bei Netzwerkfehlern bleibt der letzte Stand stehen.
 */
export function useOverlayData(token: string | null): OverlayState {
  const [state, setState] = useState<OverlayState>(token ? { status: 'loading' } : { status: 'invalid' })
  const data = useRef<OverlayData | null>(null)

  useEffect(() => {
    if (!token) return
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const device = overlayDeviceId()

    const tick = async () => {
      let delay = POLL_MS
      try {
        const payload = await rpc<OverlayPayload>('overlay_state', {
          p_token: token,
          p_version: data.current?.version ?? null,
          p_device: device,
        })
        const next = mergePayload(data.current, payload)
        if (active && next && next !== data.current) {
          data.current = next
          setState({ status: 'ready', data: next, stale: false })
        } else if (active && next) {
          setState((s) => (s.status === 'ready' && s.stale ? { ...s, stale: false } : s))
        }
      } catch (error) {
        if (!active) return
        if (error instanceof ApiError && (error.code === 'PT401' || error.code === 'PT403')) {
          // Widerrufen, falsch oder an ein anderes Gerät gebunden: selten weiter versuchen, bis es freigegeben ist
          data.current = null
          setState({ status: error.code === 'PT401' ? 'invalid' : 'locked' })
          delay = RETRY_INVALID_MS
        } else {
          setState((s) => (s.status === 'ready' ? { ...s, stale: true } : s))
        }
      }
      if (active) timer = setTimeout(() => void tick(), delay)
    }

    void tick()
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [token])

  return state
}
