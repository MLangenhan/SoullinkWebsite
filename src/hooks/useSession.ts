import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/** ID der anonymen Sitzung dieses Geräts, null ohne Sitzung, undefined während des Ladens. */
export function useSessionUserId(): string | null | undefined {
  const [userId, setUserId] = useState<string | null | undefined>(supabase ? undefined : null)

  useEffect(() => {
    if (!supabase) return
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setUserId(data.session?.user.id ?? null)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUserId(session?.user.id ?? null))
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  return userId
}
