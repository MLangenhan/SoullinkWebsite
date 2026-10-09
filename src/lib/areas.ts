import { useEffect, useState } from 'react'
import { getLang } from '@/lib/i18n'
import { hasMissed, missedKeys } from '@/lib/links'
import { withBase } from '@/lib/router'
import type { ChallengeEvent, Encounter, EncounterKind, Member, Route } from '@/lib/types'

/** Gebiete einer Edition, erzeugt von tools/generate_areas.py (public/areas/<versionGroup>.json) */
export interface AreaData {
  versionGroup: string
  /** [deutsch, englisch], Hauptregion zuerst */
  regions: [string, string][]
  /** Region-Index, Name deutsch, Name englisch, Arten ("w" wild, "s" Static/Geschenk), Routennummer (0 = keine) */
  areas: [number, string, string, string, number][]
}

const cache = new Map<string, Promise<AreaData>>()

export function loadAreas(versionGroup: string): Promise<AreaData> {
  let promise = cache.get(versionGroup)
  if (!promise) {
    promise = fetch(withBase(`/areas/${versionGroup}.json`)).then((response) => {
      if (!response.ok) throw new Error(`Gebietsliste fehlt (${response.status})`)
      return response.json() as Promise<AreaData>
    })
    promise.catch(() => cache.delete(versionGroup))
    cache.set(versionGroup, promise)
  }
  return promise
}

export function useAreas(versionGroup: string | null): AreaData | null | 'error' {
  const [state, setState] = useState<{ key: string; data: AreaData | 'error' } | null>(null)
  useEffect(() => {
    if (!versionGroup) return
    let active = true
    loadAreas(versionGroup)
      .then((data) => active && setState({ key: versionGroup, data }))
      .catch(() => active && setState({ key: versionGroup, data: 'error' }))
    return () => {
      active = false
    }
  }, [versionGroup])
  return state?.key === versionGroup ? state.data : null
}

/** Vergleichsform für Ortsnamen: ohne Groß-/Kleinschreibung, Akzente, Leer- und Satzzeichen ("Knofensa Turm" = "Knofensa-Turm") */
export function areaKey(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export type PlayerAreaState = 'caught' | 'missed' | 'open'

export interface AreaStatus {
  name: string
  /** Name in der anderen Sprache, für die Suche */
  altName: string
  /** Name, unter dem das Gebiet eingetragen wird: wie die schon angelegte Route, sonst in der eingestellten Sprache */
  routeName: string
  region: number
  kind: EncounterKind
  routeIds: string[]
  players: { member: Member; state: PlayerAreaState }[]
  /** Alle Spieler haben gefangen oder verpasst */
  done: boolean
  /** Mindestens ein Spieler hat schon etwas eingetragen */
  started: boolean
}

export interface AreaOverview {
  areas: AreaStatus[]
  /** Routen dieses Runs mit Begegnungen, die zu keinem Gebiet des Spiels passen (eigene Namen, Tippfehler) */
  unmatched: Route[]
}

/**
 * Welche Gebiete im gezeigten Run noch offen sind, je Art (wild, Static) und Spieler: Ein Spieler hat ein
 * Gebiet erledigt, wenn er dort ein Pokémon dieser Art eingetragen oder die Begegnung verpasst hat.
 * Routen werden über ihren deutschen oder englischen Namen den Gebieten des Spiels zugeordnet.
 */
export function areaOverview(
  data: AreaData,
  players: Member[],
  routes: Route[],
  encounters: Encounter[],
  events: ChallengeEvent[],
): AreaOverview {
  const english = getLang() === 'en'
  const routesByKey = new Map<string, Route[]>()
  for (const route of routes) routesByKey.set(areaKey(route.name), [...(routesByKey.get(areaKey(route.name)) ?? []), route])
  const missed = missedKeys(events)
  const matched = new Set<string>()

  const areas: AreaStatus[] = []
  for (const [region, de, en, kinds] of data.areas) {
    const found = [...(routesByKey.get(areaKey(de)) ?? []), ...(routesByKey.get(areaKey(en)) ?? [])]
    const ids = [...new Set(found.map((r) => r.id))]
    for (const id of ids) matched.add(id)
    for (const kind of ['wild', 'static'] as const) {
      if (!kinds.includes(kind === 'wild' ? 'w' : 's')) continue
      const states = players.map((member) => {
        const caught = encounters.some((e) => e.member_id === member.id && e.kind === kind && ids.includes(e.route_id))
        const gone = !caught && ids.some((id) => hasMissed(missed, member.id, id, kind))
        return { member, state: (caught ? 'caught' : gone ? 'missed' : 'open') as PlayerAreaState }
      })
      areas.push({
        name: english ? en : de,
        altName: english ? de : en,
        routeName: found[0]?.name ?? (english ? en : de),
        region,
        kind,
        routeIds: ids,
        players: states,
        done: states.every((s) => s.state !== 'open'),
        started: states.some((s) => s.state !== 'open'),
      })
    }
  }

  const used = new Set(encounters.map((e) => e.route_id))
  // Der Starter ist kein Ort und gehört in keine Gebietsliste
  const unmatched = routes.filter((r) => used.has(r.id) && !matched.has(r.id) && areaKey(r.name) !== 'starter')
  return { areas, unmatched }
}
