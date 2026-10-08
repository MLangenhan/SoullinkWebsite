import { withBase } from '@/lib/router'
import { rpc } from '@/lib/supabase'
import type { ChallengeEvent, EventType, Route } from '@/lib/types'

/** Ereignis anhängen. clientEventId macht Wiederholungen (Doppelklick, Retry) idempotent. */
export function appendEvent(
  challengeId: string,
  type: EventType,
  payload: Record<string, unknown>,
  clientEventId: string = crypto.randomUUID(),
) {
  return rpc<ChallengeEvent>('append_event', {
    p_challenge_id: challengeId,
    p_type: type,
    p_payload: payload,
    p_client_event_id: clientEventId,
  })
}

export function createRoute(challengeId: string, name: string) {
  return rpc<Route>('create_route', { p_challenge_id: challengeId, p_name: name })
}

export function revertEvent(challengeId: string, eventId: number) {
  return appendEvent(challengeId, 'event_reverted', { event_id: eventId })
}

export function inviteUrl(token: string) {
  return `${window.location.origin}${withBase('/join')}#${token}`
}
