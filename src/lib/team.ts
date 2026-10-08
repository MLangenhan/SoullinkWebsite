import type { ChallengeEvent, Encounter } from '@/lib/types'

export const TEAM_SIZE = 6

export interface Arrangement {
  /** Team-Plätze 1–6 (Index 0–5); mehr nur bei Altdaten mit über sechs Teammitgliedern */
  slots: (Encounter | null)[]
  /** Box in Fangreihenfolge */
  box: Encounter[]
}

/**
 * Team-Plätze eines Spielers aus den Ereignissen des Runs nachspielen, wie im Spiel:
 * Ein Fang ins Team nimmt den ersten freien Platz, ein Wechsel ins Team den gewünschten (slot),
 * ein Platzwechsel innerhalb des Teams tauscht mit dem bisherigen Inhaber. Box und Tod geben den Platz frei.
 */
export function arrange(memberId: string, encounters: Encounter[], events: ChallengeEvent[]): Arrangement {
  const own = encounters.filter((e) => e.member_id === memberId)
  const byId = new Map(own.map((e) => [e.encounter_id, e]))
  const linkOf = new Map(encounters.map((e) => [e.encounter_id, e.link_id]))
  const byLink = new Map<string, string[]>()
  for (const e of own) byLink.set(e.link_id, [...(byLink.get(e.link_id) ?? []), e.encounter_id])

  const reverted = new Set(events.filter((e) => e.type === 'event_reverted').map((e) => Number(e.payload.event_id)))
  const slots: (string | null)[] = Array.from({ length: TEAM_SIZE }, () => null)

  const remove = (id: string) => {
    const index = slots.indexOf(id)
    if (index >= 0) slots[index] = null
  }
  const firstFree = () => {
    const index = slots.indexOf(null)
    if (index >= 0) return index
    slots.push(null)
    return slots.length - 1
  }
  const place = (id: string, wanted?: number) => {
    const current = slots.indexOf(id)
    const target = wanted !== undefined && wanted >= 0 && wanted < slots.length ? wanted : undefined
    if (current >= 0) {
      if (target === undefined || target === current) return
      // Platzwechsel im Team: der Inhaber des Zielplatzes rückt auf den alten Platz
      slots[current] = slots[target]
      slots[target] = id
      return
    }
    if (target !== undefined && slots[target] === null) {
      slots[target] = id
      return
    }
    if (target !== undefined) {
      // Zielplatz belegt (sollte nicht vorkommen): Inhaber weicht aus
      const occupant = slots[target]!
      slots[target] = id
      slots[firstFree()] = occupant
      return
    }
    slots[firstFree()] = id
  }

  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    if (event.type === 'event_reverted' || reverted.has(event.id)) continue
    const id = typeof event.payload.encounter_id === 'string' ? event.payload.encounter_id : null
    if (!id) continue
    if (event.type === 'pokemon_died') {
      // Der ganze Soul-Link stirbt, auch wenn das Pokémon eines anderen Spielers gestorben ist
      for (const partner of byLink.get(linkOf.get(id) ?? '') ?? []) remove(partner)
    } else if (!byId.has(id)) {
      continue
    } else if (event.type === 'encounter_logged' && event.payload.status === 'team') {
      place(id)
    } else if (event.type === 'encounter_status_changed') {
      if (event.payload.status === 'box') remove(id)
      else place(id, typeof event.payload.slot === 'number' ? event.payload.slot - 1 : undefined)
    }
  }

  // Abgleich mit dem tatsächlichen Zustand (z. B. Partner, die über einen anderen Spieler gestorben sind)
  for (let i = 0; i < slots.length; i++) if (slots[i] && byId.get(slots[i]!)?.state !== 'team') slots[i] = null
  for (const e of own) if (e.state === 'team' && !slots.includes(e.encounter_id)) slots[firstFree()] = e.encounter_id
  while (slots.length > TEAM_SIZE && slots[slots.length - 1] === null) slots.pop()

  return {
    slots: slots.map((id) => (id ? byId.get(id)! : null)),
    box: own.filter((e) => e.state === 'box'),
  }
}

export interface Move {
  encounter: Encounter
  status: 'team' | 'box'
  /** Platz 1–6 */
  slot?: number
}

/** Was ein Teamwechsel bei einem anderen Spieler auslöst */
export interface Effect {
  memberId: string
  in: Move[]
  out: Move[]
  /** Warum etwas nicht angeglichen wird (kein Partner, Team voll) */
  notes: string[]
}

const alive = (e: Encounter) => e.state === 'team' || e.state === 'box'

/**
 * Soul-Link-Partner der anderen Spieler nachziehen: Geht ein Pokémon in die Box, folgen seine Partner;
 * kommt eines ins Team, folgen sie auch und nehmen den Platz ein, den ihr ausgetauschter Partner frei macht.
 * Wild und Static sind getrennte Soul-Links und bleiben es; bei Paaren betrifft es nur den Partner.
 * Platzwechsel innerhalb des Teams bleiben persönlich.
 */
export function mirror(
  primary: Move[],
  ownerId: string,
  memberIds: string[],
  encounters: Encounter[],
  events: ChallengeEvent[],
  routeName: (e: Encounter) => string,
): Effect[] {
  const changes = primary.filter((m) => m.encounter.state !== m.status)
  const effects: Effect[] = []
  for (const memberId of memberIds) {
    if (memberId === ownerId) continue
    const effect: Effect = { memberId, in: [], out: [], notes: [] }
    const arrangement = arrange(memberId, encounters, events)
    const partnerOf = (move: Move) =>
      encounters.find((e) => e.member_id === memberId && e.link_id === move.encounter.link_id && alive(e))
    const linked = (move: Move) => encounters.some((e) => e.member_id === memberId && e.link_id === move.encounter.link_id)

    const freed: number[] = []
    for (const move of changes.filter((m) => m.status === 'box')) {
      const partner = partnerOf(move)
      if (partner?.state === 'team') {
        effect.out.push({ encounter: partner, status: 'box' })
        freed.push(arrangement.slots.findIndex((e) => e?.encounter_id === partner.encounter_id))
      }
    }
    const taken = new Set(arrangement.slots.flatMap((e, i) => (e && !effect.out.some((o) => o.encounter.encounter_id === e.encounter_id) ? [i] : [])))
    let teamSize = taken.size
    for (const move of changes.filter((m) => m.status === 'team')) {
      const partner = partnerOf(move)
      if (!partner) {
        if (!linked(move)) effect.notes.push(`kein Pokémon von ${routeName(move.encounter)}`)
        continue
      }
      if (partner.state === 'team') continue
      if (teamSize >= TEAM_SIZE) {
        effect.notes.push('Team voll')
        continue
      }
      // Platz des ausgetauschten Partners, sonst der erste freie
      let slot = freed.shift()
      if (slot === undefined || slot < 0 || taken.has(slot)) {
        slot = Array.from({ length: TEAM_SIZE }, (_, i) => i).find((i) => !taken.has(i) && !freed.includes(i))
      }
      if (slot === undefined) {
        effect.notes.push('Team voll')
        continue
      }
      taken.add(slot)
      teamSize++
      effect.in.push({ encounter: partner, status: 'team', slot: slot + 1 })
    }
    if (effect.in.length || effect.out.length || effect.notes.length) effects.push(effect)
  }
  return effects
}

/** Lebende Soul-Link-Partner, die nicht im selben Zustand (Team/Box) sind wie dieses Pokémon */
export function unsynced(encounter: Encounter, encounters: Encounter[]): Encounter[] {
  if (!alive(encounter)) return []
  return encounters.filter(
    (e) => e.link_id === encounter.link_id && e.encounter_id !== encounter.encounter_id && alive(e) && e.state !== encounter.state,
  )
}
