import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as
  | string
  | undefined

/** null, solange die Umgebungsvariablen fehlen (die App zeigt dann eine Einrichtungsseite). */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null

export function db(): SupabaseClient {
  if (!supabase) throw new Error('Supabase ist nicht konfiguriert')
  return supabase
}

/** Fehler der Datenbank (PT4xx aus den RPCs) als lesbare Meldung. */
export class ApiError extends Error {
  readonly code: string | undefined
  constructor(error: PostgrestError | Error) {
    super(error.message)
    this.code = 'code' in error ? error.code : undefined
  }
}

export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db().rpc(fn, args)
  if (error) throw new ApiError(error)
  return data as T
}

/** Gerät anmelden, falls noch keine Sitzung besteht (anonyme Sitzung, kein Konto). */
export async function ensureSession(): Promise<string> {
  const client = db()
  const { data } = await client.auth.getSession()
  if (data.session) return data.session.user.id
  const { data: signedIn, error } = await client.auth.signInAnonymously()
  if (error || !signedIn.user) throw new ApiError(error ?? new Error('Anmeldung fehlgeschlagen'))
  return signedIn.user.id
}
