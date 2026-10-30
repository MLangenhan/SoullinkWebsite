import { arrange, type Arrangement } from '@/lib/team'
import type { Challenge, ChallengeEvent, ChallengeStats, Encounter, Member, Route } from '@/lib/types'

/*
  OBS-Overlays: Die Einstellungen eines Overlays stehen komplett in der Adresse (Abfrage-Parameter),
  das Token im #-Teil. So bleibt ein Overlay ein einziger Link, den man in OBS als Browserquelle einfügt,
  und jede Variante ist einfach ein anderer Link desselben Tokens.
*/

/** Bausteine eines Overlays, in der gewählten Reihenfolge */
export const WIDGETS = ['link', 'team', 'cap', 'stats'] as const
export type Widget = (typeof WIDGETS)[number]

export type OverlayTheme = 'dark' | 'light' | 'clear'
export type OverlayDirection = 'column' | 'row'
export type OverlayAlign = 'start' | 'center' | 'end'

export interface OverlayConfig {
  widgets: Widget[]
  /** Plätze (seat) der gezeigten Spieler; leer = alle Spieler */
  seats: number[]
  direction: OverlayDirection
  align: OverlayAlign
  theme: OverlayTheme
  /** Akzentfarbe als #rrggbb */
  accent: string
  /** Größe in Prozent */
  scale: number
  /** Spielernamen zeigen */
  names: boolean
  /** Überschriften der Bausteine zeigen */
  titles: boolean
  /** Pokémon-Namen unter den Sprites */
  pokemonNames: boolean
  /** Spitznamen statt Artnamen, wo vorhanden */
  nicknames: boolean
  /** Leere Team-Plätze als Rahmen zeigen (sonst nur belegte Plätze) */
  emptySlots: boolean
  lang: 'de' | 'en'
}

export const DEFAULT_CONFIG: OverlayConfig = {
  widgets: ['link'],
  seats: [],
  direction: 'column',
  align: 'start',
  theme: 'dark',
  accent: '#f5b301',
  scale: 100,
  names: true,
  titles: true,
  pokemonNames: true,
  nicknames: true,
  emptySlots: true,
  lang: 'de',
}

const SCALE_MIN = 50
const SCALE_MAX = 250

const oneOf = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T =>
  value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback

const flag = (value: string | null, fallback: boolean) => (value === '1' ? true : value === '0' ? false : fallback)

/** Liest die Overlay-Einstellungen aus den Abfrage-Parametern; Unbekanntes fällt auf Standardwerte zurück. */
export function parseConfig(search: string): OverlayConfig {
  const q = new URLSearchParams(search)
  const widgets = (q.get('w') ?? '')
    .split(',')
    .map((w) => w.trim())
    .filter((w): w is Widget => (WIDGETS as readonly string[]).includes(w))
  const seats = (q.get('p') ?? '')
    .split(',')
    .filter((s) => s.trim() !== '')
    .map((s) => Number(s))
    .filter((s) => Number.isInteger(s) && s >= 0 && s < 100)
  const accent = q.get('accent') ?? ''
  const scale = Number(q.get('scale'))

  return {
    widgets: widgets.length ? [...new Set(widgets)] : DEFAULT_CONFIG.widgets,
    seats: [...new Set(seats)],
    direction: oneOf(q.get('dir'), ['column', 'row'] as const, DEFAULT_CONFIG.direction),
    align: oneOf(q.get('align'), ['start', 'center', 'end'] as const, DEFAULT_CONFIG.align),
    theme: oneOf(q.get('theme'), ['dark', 'light', 'clear'] as const, DEFAULT_CONFIG.theme),
    accent: /^[0-9a-f]{6}$/i.test(accent) ? `#${accent.toLowerCase()}` : DEFAULT_CONFIG.accent,
    scale: Number.isFinite(scale) && scale > 0 ? Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(scale))) : DEFAULT_CONFIG.scale,
    names: flag(q.get('names'), DEFAULT_CONFIG.names),
    titles: flag(q.get('titles'), DEFAULT_CONFIG.titles),
    pokemonNames: flag(q.get('pnames'), DEFAULT_CONFIG.pokemonNames),
    nicknames: flag(q.get('nick'), DEFAULT_CONFIG.nicknames),
    emptySlots: flag(q.get('slots'), DEFAULT_CONFIG.emptySlots),
    lang: oneOf(q.get('lang'), ['de', 'en'] as const, DEFAULT_CONFIG.lang),
  }
}

/** Schreibt nur Abweichungen vom Standard, damit die Links kurz bleiben. */
export function serializeConfig(config: OverlayConfig): string {
  const q = new URLSearchParams()
  const d = DEFAULT_CONFIG
  q.set('w', config.widgets.join(','))
  if (config.seats.length) q.set('p', [...config.seats].sort((a, b) => a - b).join(','))
  if (config.direction !== d.direction) q.set('dir', config.direction)
  if (config.align !== d.align) q.set('align', config.align)
  if (config.theme !== d.theme) q.set('theme', config.theme)
  if (config.accent !== d.accent) q.set('accent', config.accent.replace('#', ''))
  if (config.scale !== d.scale) q.set('scale', String(config.scale))
  if (config.names !== d.names) q.set('names', config.names ? '1' : '0')
  if (config.titles !== d.titles) q.set('titles', config.titles ? '1' : '0')
  if (config.pokemonNames !== d.pokemonNames) q.set('pnames', config.pokemonNames ? '1' : '0')
  if (config.nicknames !== d.nicknames) q.set('nick', config.nicknames ? '1' : '0')
  if (config.emptySlots !== d.emptySlots) q.set('slots', config.emptySlots ? '1' : '0')
  if (config.lang !== d.lang) q.set('lang', config.lang)
  return q.toString().replace(/%2C/g, ',')
}

/** Vollständige Overlay-Adresse: Pfad, Einstellungen und Token (im #-Teil, geht nie an einen Server) */
export function overlayUrl(origin: string, basePath: string, token: string, config: OverlayConfig) {
  return `${origin}${basePath.replace(/\/$/, '')}/obs?${serializeConfig(config)}#${token}`
}

const DEVICE_KEY = 'soullink.overlay.device'
let sessionDevice: string | null = null

/**
 * Zufällige Geräte-ID der Browserquelle (32 Byte, base64url). Links mit Gerätebindung merken sich die
 * erste ID, die sie sehen; OBS behält sie in seinem Browser-Speicher über Neustarts hinweg.
 */
export function overlayDeviceId(): string {
  try {
    const stored = localStorage.getItem(DEVICE_KEY)
    if (stored && /^[A-Za-z0-9_-]{20,100}$/.test(stored)) return stored
  } catch {
    // Speicher gesperrt: ID gilt nur bis zum Neuladen
  }
  if (!sessionDevice) {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    sessionDevice = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }
  try {
    localStorage.setItem(DEVICE_KEY, sessionDevice)
  } catch {
    // siehe oben
  }
  return sessionDevice
}

/** Overlay-Adresse mit verdecktem Token, für Anzeigen, die im Stream landen könnten */
export function maskedOverlayUrl(url: string) {
  return url.replace(/#slo_.*$/, '#slo_••••••••')
}

/** Antwort von overlay_state: vollständig oder nur die Version, wenn sich nichts geändert hat */
export interface OverlayPayload {
  version: string
  challenge?: Challenge
  stats?: ChallengeStats
  members?: Member[]
  routes?: Route[]
  encounters?: Encounter[]
  events?: ChallengeEvent[]
}

export interface OverlayData {
  version: string
  challenge: Challenge
  stats: ChallengeStats
  members: Member[]
  routes: Route[]
  encounters: Encounter[]
  events: ChallengeEvent[]
}

/** Übernimmt eine Antwort; „unverändert“ behält den bisherigen Stand. */
export function mergePayload(previous: OverlayData | null, payload: OverlayPayload): OverlayData | null {
  if (!payload.challenge) return previous
  return {
    version: payload.version,
    challenge: payload.challenge,
    stats: payload.stats!,
    members: payload.members ?? [],
    routes: payload.routes ?? [],
    encounters: payload.encounters ?? [],
    events: payload.events ?? [],
  }
}

/** Gezeigte Spieler in Platz-Reihenfolge; ohne Auswahl alle Spieler (keine Zuschauer) */
export function shownPlayers(members: Member[], seats: number[]): Member[] {
  const players = members.filter((m) => m.role !== 'viewer' && m.seat !== null).sort((a, b) => a.seat! - b.seat!)
  return seats.length ? players.filter((m) => seats.includes(m.seat!)) : players
}

export interface LatestLink {
  linkId: string
  routeId: string
  loggedAt: string
  /** Fang je gezeigtem Spieler (null: dieser Spieler hat auf der Route nichts) */
  catches: { member: Member; encounter: Encounter | null }[]
}

/** Der zuletzt eingetragene Soul-Link (jüngster Fang, alle Pokémon derselben Verbindung) */
export function latestLink(encounters: Encounter[], players: Member[]): LatestLink | null {
  if (!encounters.length) return null
  const newest = encounters.reduce((a, b) => (b.logged_at > a.logged_at || (b.logged_at === a.logged_at && b.event_id > a.event_id) ? b : a))
  const linked = encounters.filter((e) => e.link_id === newest.link_id)
  return {
    linkId: newest.link_id,
    routeId: newest.route_id,
    loggedAt: newest.logged_at,
    catches: players.map((member) => ({ member, encounter: linked.find((e) => e.member_id === member.id) ?? null })),
  }
}

/** Aktuelles Team je Spieler, wie im Tab „Teams“ berechnet */
export function teams(data: Pick<OverlayData, 'encounters' | 'events'>, players: Member[]): { member: Member; team: Arrangement['slots'] }[] {
  return players.map((member) => ({ member, team: arrange(member.id, data.encounters, data.events).slots }))
}
