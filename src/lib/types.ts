// Zeilentypen der Tabellen und Views aus supabase/migrations (von Hand gepflegt)

export type Role = 'owner' | 'player' | 'viewer'
export type Visibility = 'public' | 'private'
export type EncounterKind = 'wild' | 'static'
export type EncounterStatus = 'team' | 'box'
export type PokemonState = EncounterStatus | 'dead' | 'linked_dead'
export type EventType =
  | 'encounter_logged'
  | 'encounter_missed'
  | 'encounter_status_changed'
  | 'encounter_evolved'
  | 'pokemon_died'
  | 'run_ended'
  | 'counter_adjusted'
  | 'event_reverted'

export interface Species {
  id: number
  slug: string
  name_en: string
  name_de: string
  generation: number
  evolution_chain_id: number
  evolves_from_id: number | null
  evolution_stage: number
  sprite_url: string
}

export interface Challenge {
  id: string
  slug: string
  name: string
  game: string
  visibility: Visibility
  bot_allow_unlinked: boolean
  last_seq: number
  created_at: string
}

export interface Member {
  id: string
  challenge_id: string
  role: Role
  display_name: string
  color: string | null
  seat: number | null
  discord_id: string | null
  /** Soul-Link-Gruppe (z. B. Paare); null = alle ohne Gruppe sind verbunden */
  link_group: number | null
}

export interface Route {
  id: string
  challenge_id: string
  name: string
  sort_order: number
}

export interface Encounter {
  challenge_id: string
  run_number: number
  encounter_id: string
  link_id: string
  member_id: string
  route_id: string
  kind: EncounterKind
  caught_species_id: number
  species_id: number
  nickname: string | null
  state: PokemonState
  lost_at: string | null
  lost_with_encounter_id: string | null
  death_event_id: number | null
  death_route_id: string | null
  death_cause: string | null
  death_opponent: string | null
  death_level: number | null
  logged_at: string
  event_id: number
}

export interface ChallengeStats {
  challenge_id: string
  current_run: number
  runs_finished: number
  wipes_total: number
  wins_total: number
}

export interface MemberStats {
  challenge_id: string
  member_id: string
  display_name: string
  seat: number
  current_run: number
  deaths_run: number
  deaths_total: number
  missed_run: number
  missed_total: number
  wipes_caused: number
}

export interface ChallengeEvent {
  id: number
  challenge_id: string
  seq: number
  run_number: number
  type: EventType
  payload: Record<string, unknown>
  source: 'web' | 'bot' | 'migration'
  actor_member_id: string | null
  actor_discord_id: string | null
  reverts_event_id: number | null
  occurred_at: string
}

export interface Invite {
  id: string
  challenge_id: string
  role: Role
  member_id: string | null
  max_uses: number
  uses: number
  expires_at: string
  revoked_at: string | null
  created_at: string
}

export interface BotToken {
  id: string
  challenge_id: string
  label: string
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

export interface Device {
  user_id: string
  challenge_id: string
  member_id: string
  created_at: string
}

export interface InvitePreview {
  challenge_name: string
  challenge_slug: string
  role: Role
  member_name: string | null
  expires_at: string
}
