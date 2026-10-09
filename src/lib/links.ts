import { TEAM_SIZE } from '@/lib/team'
import type { ChallengeEvent, Encounter, EncounterKind, Member } from '@/lib/types'

/**
 * Vollständigkeit der Soul-Links. Ein Soul-Link ist erst nutzbar, wenn jeder Spieler seiner Gruppe
 * (alle oder das Paar) ein Pokémon darin hat. Hat ein fehlender Spieler die Route als verpasst
 * eingetragen, ist der Soul-Link verfallen und bleibt es.
 */
export interface LinkInfo {
  linkId: string
  routeId: string
  kind: EncounterKind
  /** Spieler, die ein Pokémon in diesem Soul-Link haben müssen */
  required: string[]
  missing: string[]
  /** Fehlende Spieler, die die Route verpasst haben */
  missed: string[]
  complete: boolean
  failed: boolean
}

const groupOf = (member: Member | undefined) => member?.link_group ?? -1
const missKey = (memberId: string, routeId: string, kind: string) => `${memberId}|${routeId}|${kind}`

/** Aktive "verpasst"-Einträge (ohne rückgängig gemachte) als Schlüssel Spieler|Route|Art */
export function missedKeys(events: ChallengeEvent[]): Set<string> {
  const reverted = new Set(events.filter((e) => e.type === 'event_reverted').map((e) => Number(e.payload.event_id)))
  const keys = new Set<string>()
  for (const e of events) {
    if (e.type !== 'encounter_missed' || reverted.has(e.id) || typeof e.payload.route_id !== 'string') continue
    keys.add(missKey(String(e.payload.member_id), e.payload.route_id, typeof e.payload.kind === 'string' ? e.payload.kind : 'wild'))
  }
  return keys
}

export function hasMissed(keys: Set<string>, memberId: string, routeId: string, kind: EncounterKind) {
  return keys.has(missKey(memberId, routeId, kind))
}

export function analyzeLinks(players: Member[], encounters: Encounter[], events: ChallengeEvent[]): Map<string, LinkInfo> {
  const members = new Map(players.map((p) => [p.id, p]))
  const missed = missedKeys(events)
  const byLink = new Map<string, Encounter[]>()
  for (const e of encounters) byLink.set(e.link_id, [...(byLink.get(e.link_id) ?? []), e])

  const result = new Map<string, LinkInfo>()
  for (const [linkId, list] of byLink) {
    const first = list[0]
    const group = groupOf(members.get(first.member_id))
    const required = players.filter((p) => groupOf(p) === group).map((p) => p.id)
    const present = new Set(list.map((e) => e.member_id))
    const missing = required.filter((id) => !present.has(id))
    const missedBy = missing.filter((id) => hasMissed(missed, id, first.route_id, first.kind))
    result.set(linkId, {
      linkId,
      routeId: first.route_id,
      kind: first.kind,
      required,
      missing,
      missed: missedBy,
      complete: missing.length === 0,
      failed: missedBy.length > 0,
    })
  }
  return result
}

/**
 * Team oder Box für neue Fänge: Team, wenn der Soul-Link damit vollständig ist und alle Beteiligten
 * weniger als sechs Pokémon im Team haben; die schon gefangenen Partner aus der Box kommen dann mit
 * ins Team (promote). Sonst alles in die Box.
 */
export function autoStatus(
  players: Member[],
  encounters: Encounter[],
  routeId: string | null,
  kind: EncounterKind,
  newMembers: string[],
): { status: Map<string, 'team' | 'box'>; promote: Encounter[] } {
  const members = new Map(players.map((p) => [p.id, p]))
  const status = new Map<string, 'team' | 'box'>()
  const promote: Encounter[] = []
  const teamCount = (id: string) => encounters.filter((e) => e.member_id === id && e.state === 'team').length

  const groups = new Map<number, string[]>()
  for (const id of newMembers) groups.set(groupOf(members.get(id)), [...(groups.get(groupOf(members.get(id))) ?? []), id])

  for (const [group, newcomers] of groups) {
    const required = players.filter((p) => groupOf(p) === group).map((p) => p.id)
    // Jüngster Soul-Link dieser Gruppe auf der Route, in dem die Neuen noch fehlen (wie die Datenbank)
    const candidates = routeId
      ? encounters.filter((e) => e.route_id === routeId && e.kind === kind && required.includes(e.member_id))
      : []
    const links = [...new Set(candidates.map((e) => e.link_id))]
      .map((id) => candidates.filter((e) => e.link_id === id))
      .filter((list) => !list.some((e) => newcomers.includes(e.member_id)))
      .sort((a, b) => b[0].logged_at.localeCompare(a[0].logged_at))
    const partners = links[0] ?? []
    const covered = new Set([...partners.map((e) => e.member_id), ...newcomers])
    const complete = required.every((id) => covered.has(id))
    const alive = partners.every((e) => e.state === 'team' || e.state === 'box')
    const room = required.every((id) => teamCount(id) < TEAM_SIZE || partners.some((e) => e.member_id === id && e.state === 'team'))
    const team = complete && alive && room
    for (const id of newcomers) status.set(id, team ? 'team' : 'box')
    if (team) promote.push(...partners.filter((e) => e.state === 'box'))
  }
  return { status, promote }
}

/**
 * Soul-Links statt einzelner Pokémon: Ein Link lebt, solange eins seiner Pokémon lebt (stirbt eins, sterben
 * alle mit). Bei „alle verbunden“ ist das die Zahl der Pokémon geteilt durch die Spieler, bei Paaren zählt
 * jedes Paar für sich.
 */
export function countLinks(encounters: Encounter[]) {
  const alive = new Map<string, boolean>()
  for (const e of encounters) alive.set(e.link_id, (alive.get(e.link_id) ?? false) || e.state === 'team' || e.state === 'box')
  const living = [...alive.values()].filter(Boolean).length
  return { alive: living, lost: alive.size - living }
}
