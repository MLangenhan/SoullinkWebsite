import { useMemo } from 'react'
import { versionGroupFor } from '@/data/levelCaps'
import { areaKey, useAreas } from '@/lib/areas'
import { useLang } from '@/lib/i18n'
import type { Route } from '@/lib/types'

export interface RouteNames {
  /** Name in der eingestellten Sprache, wenn er ein Ort des Spiels ist; sonst wie eingetragen */
  display: (name: string) => string
  /** Bestehende Route zu einem eingegebenen Namen, auch über die andere Sprache („Azalea Town“ = „Azalea City“) */
  find: (routes: Route[], name: string) => Route | undefined
  /** Alle Orte des Spiels in der eingestellten Sprache, als Vorschläge beim Eintragen */
  suggestions: string[]
}

/**
 * Routennamen in beiden Sprachen: Routen bleiben gespeichert, wie sie eingetragen wurden (auch vom Bot), und
 * werden über die Gebietsliste des Spiels (public/areas) übersetzt. Eigene Namen wie „Starter“ bleiben, wie sie sind.
 */
export function useRouteNames(challenge: { game: string; level_cap_preset: string | null } | null | undefined): RouteNames {
  const lang = useLang()
  const areas = useAreas(challenge ? versionGroupFor(challenge) : null)

  return useMemo(() => {
    const byKey = new Map<string, [string, string]>()
    const list = areas && areas !== 'error' ? areas.areas : []
    for (const [, de, en] of list) {
      // Ein Objekt für beide Schlüssel: gleicher Ort = dasselbe Paar
      const pair: [string, string] = [de, en]
      byKey.set(areaKey(de), pair)
      byKey.set(areaKey(en), pair)
    }
    const english = lang === 'en'
    const pick = (pair: [string, string]) => (english ? pair[1] : pair[0])
    const display = (name: string) => {
      const pair = byKey.get(areaKey(name))
      return pair ? pick(pair) : name
    }
    // Gleicher Ort, wenn beide Namen auf dasselbe Gebiet zeigen oder gleich geschrieben sind
    const same = (a: string, b: string) => {
      if (areaKey(a) === areaKey(b)) return true
      const pa = byKey.get(areaKey(a))
      return pa !== undefined && pa === byKey.get(areaKey(b))
    }
    return {
      display,
      find: (routes, name) => {
        const trimmed = name.trim()
        if (!trimmed) return undefined
        return routes.find((r) => r.name.trim().toLowerCase() === trimmed.toLowerCase()) ?? routes.find((r) => same(r.name, trimmed))
      },
      suggestions: [...new Set(list.map(([, de, en]) => pick([de, en])))],
    }
  }, [areas, lang])
}
