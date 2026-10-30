import { useEffect, useMemo } from 'react'
import { OverlayView } from '@/components/overlay/OverlayView'
import { useOverlayData } from '@/hooks/useOverlayData'
import { useSpecies } from '@/hooks/useSpecies'
import { setLang, useT } from '@/lib/i18n'
import { parseConfig } from '@/lib/overlay'

/**
 * OBS-Browserquelle: nur das Overlay auf transparentem Grund, ohne Navigation.
 * Adresse: /obs?w=link,team&…#<overlay-token>. Größe der Quelle in OBS z. B. 1920 × 1080.
 */
export function Overlay() {
  const t = useT()
  const config = useMemo(() => parseConfig(window.location.search), [])
  const token = useMemo(() => {
    const hash = window.location.hash.slice(1)
    return /^slo_[A-Za-z0-9_-]{20,}$/.test(hash) ? hash : null
  }, [])
  const state = useOverlayData(token)
  const species = useSpecies()

  useEffect(() => {
    // Transparenter Hintergrund für OBS; Sprache des Overlays, ohne die Wahl des Geräts zu speichern
    document.documentElement.dataset.overlay = ''
    document.title = 'Soul Link · OBS'
    setLang(config.lang, { persist: false })
    return () => {
      delete document.documentElement.dataset.overlay
    }
  }, [config.lang])

  const justify = config.align === 'start' ? 'flex-start' : config.align === 'end' ? 'flex-end' : 'center'

  return (
    <main className="flex min-h-svh p-4" style={{ justifyContent: justify, alignItems: 'flex-start' }}>
      {state.status === 'invalid' ? (
        // Nur für die Einrichtung sichtbar: Im Stream steht dann eine klare Meldung statt nichts
        <p className="rounded-lg bg-black/80 px-3 py-2 text-sm text-white">
          {t('Overlay-Link ungültig oder widerrufen. Erstelle in den Einstellungen der Challenge einen neuen.')}
        </p>
      ) : state.status === 'ready' ? (
        <OverlayView data={state.data} config={config} species={species} />
      ) : null}
    </main>
  )
}
