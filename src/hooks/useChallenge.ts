import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouteNames } from '@/lib/routeNames'
import { db } from '@/lib/supabase'
import type {
  Challenge,
  ChallengeEvent,
  ChallengeStats,
  Encounter,
  Member,
  MemberStats,
  Route,
} from '@/lib/types'

export interface ChallengeData {
  challenge: Challenge
  members: Member[]
  players: Member[]
  routes: Route[]
  stats: ChallengeStats
  memberStats: MemberStats[]
  /** Begegnungen des angezeigten Runs */
  encounters: Encounter[]
  /** Ereignisse des angezeigten Runs, neueste zuerst */
  events: ChallengeEvent[]
  shownRun: number
  me: Member | null
  canWrite: boolean
  isOwner: boolean
}

export type ChallengeState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: ChallengeData; refresh: () => Promise<void> }

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message)
  return result.data as T
}

/**
 * Lädt eine Challenge samt Projektionen und hält sie per Realtime aktuell.
 * run = null zeigt immer den laufenden Run.
 */
export function useChallenge(slug: string, run: number | null, userId: string | null | undefined): ChallengeState {
  const [state, setState] = useState<ChallengeState>({ status: 'loading' })
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const loadRef = useRef<() => Promise<void>>(async () => {})
  // Nur die jüngste Anfrage darf den Zustand setzen (schneller Run-Wechsel, Realtime-Schübe)
  const latest = useRef(0)

  const load = useCallback(async () => {
    const request = ++latest.current
    const client = db()
    const challenge = check(await client.from('challenges').select('*').eq('slug', slug).maybeSingle()) as Challenge | null
    if (!challenge) {
      if (request === latest.current) setState({ status: 'missing' })
      return
    }
    const stats = check(
      await client.from('challenge_stats').select('*').eq('challenge_id', challenge.id).single(),
    ) as ChallengeStats
    const shownRun = run !== null && run >= 1 && run <= stats.current_run ? run : stats.current_run

    const [members, routes, memberStats, encounters, events, device] = await Promise.all([
      client.from('challenge_members').select('*').eq('challenge_id', challenge.id),
      client.from('routes').select('*').eq('challenge_id', challenge.id).order('sort_order'),
      client.from('member_stats').select('*').eq('challenge_id', challenge.id).order('seat'),
      client.from('encounters').select('*').eq('challenge_id', challenge.id).eq('run_number', shownRun).order('logged_at'),
      client
        .from('events')
        .select('id, challenge_id, seq, run_number, type, payload, source, actor_member_id, actor_discord_id, reverts_event_id, occurred_at')
        .eq('challenge_id', challenge.id)
        .eq('run_number', shownRun)
        .order('seq', { ascending: false })
        .limit(1000),
      userId
        ? client.from('member_devices').select('member_id').eq('challenge_id', challenge.id).eq('user_id', userId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])

    if (request !== latest.current) return
    const memberList = (check(members) as Member[]).sort(
      (a, b) => (a.seat ?? 999) - (b.seat ?? 999) || a.display_name.localeCompare(b.display_name),
    )
    const myMemberId = (check(device) as { member_id: string } | null)?.member_id ?? null
    const me = memberList.find((m) => m.id === myMemberId) ?? null

    setChallengeId(challenge.id)
    setState({
      status: 'ready',
      refresh: () => loadRef.current(),
      data: {
        challenge,
        members: memberList,
        players: memberList.filter((m) => m.role !== 'viewer'),
        routes: check(routes) as Route[],
        stats,
        memberStats: check(memberStats) as MemberStats[],
        encounters: check(encounters) as Encounter[],
        events: check(events) as ChallengeEvent[],
        shownRun,
        me,
        canWrite: me !== null && me.role !== 'viewer',
        isOwner: me?.role === 'owner',
      },
    })
  }, [slug, run, userId])

  useEffect(() => {
    loadRef.current = load
  }, [load])

  useEffect(() => {
    const counter = latest
    load().catch((error: Error) => setState({ status: 'error', message: error.message }))
    return () => {
      // Antworten zu alten Parametern verwerfen
      counter.current++
    }
  }, [load])

  // Live-Updates: jede Änderung an Ereignissen, Mitgliedern, Routen oder der Challenge lädt gebündelt neu
  useEffect(() => {
    if (!challengeId) return
    const client = db()
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(() => void loadRef.current().catch(() => undefined), 120)
    }
    const filter = `challenge_id=eq.${challengeId}`
    const channel = client
      .channel(`challenge:${challengeId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events', filter }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'challenge_members', filter }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'routes', filter }, schedule)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'challenges', filter: `id=eq.${challengeId}` }, schedule)
      .subscribe()
    return () => {
      clearTimeout(timer)
      void client.removeChannel(channel)
    }
  }, [challengeId])

  return state
}

/** Hilfsfunktionen auf den geladenen Daten */
export function useLookups(data: ChallengeData | null) {
  const routeNames = useRouteNames(data?.challenge)
  return useMemo(() => {
    const members = new Map((data?.members ?? []).map((m) => [m.id, m]))
    // Routennamen in der eingestellten Sprache (Orte des Spiels werden übersetzt)
    const routes = new Map((data?.routes ?? []).map((r) => [r.id, { ...r, name: routeNames.display(r.name) }]))
    const encounters = new Map((data?.encounters ?? []).map((e) => [e.encounter_id, e]))
    return { members, routes, encounters }
  }, [data, routeNames])
}
