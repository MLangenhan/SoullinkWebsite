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
