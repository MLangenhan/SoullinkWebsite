import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Pokeball } from '@/components/Pokeball'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { useT } from '@/lib/i18n'
import { linkProps, navigate, withBase } from '@/lib/router'
import { ensureSession, rpc } from '@/lib/supabase'
import { toast, translateError } from '@/lib/toast'
import type { InvitePreview, Member } from '@/lib/types'

const roleLabel = { owner: 'Einladung als Leitung', player: 'Einladung als Spieler', viewer: 'Einladung als Zuschauer' } as const

/**
 * Einladungslink einlösen. Der Token steht im #-Teil der Adresse und wird so nie an einen Server
 * (auch nicht an Vercel) übertragen. Nach dem Lesen wird er aus der Adresszeile entfernt.
 */
export function Join() {
  const t = useT()
  const [token] = useState(() => window.location.hash.slice(1))
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [error, setError] = useState<string | null>(() =>
    token.startsWith('inv_') ? null : 'Dieser Link enthält keine Einladung.',
  )
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!token.startsWith('inv_')) return
    rpc<InvitePreview>('invite_preview', { p_token: token })
      .then(setPreview)
      .catch((e: Error) => setError(e.message))
  }, [token])

  const join = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!preview) return
    setBusy(true)
    try {
      await ensureSession()
      const member = await rpc<Member>('join_challenge', { p_token: token, p_display_name: name || null })
      window.history.replaceState(null, '', withBase('/join'))
      toast(t('Willkommen, {name}! Dieses Gerät ist jetzt verbunden.', { name: member.display_name }))
      navigate(`/c/${preview.challenge_slug}`, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Beitritt fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="dot-bg flex min-h-svh items-center justify-center px-4 pt-20">
      <motion.div
        className="w-full max-w-md rounded-2xl border bg-card/90 p-8 shadow-2xl backdrop-blur"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        {error ? (
          <div className="grid gap-4 text-center">
            <p className="label text-destructive">{t('Einladung')}</p>
            <h1 className="font-display tracking-tight text-4xl font-extrabold">{t('Das hat nicht geklappt')}</h1>
            <p className="text-muted-foreground">{translateError(error)}</p>
            <p className="text-sm text-muted-foreground">{t('Lass dir von der Leitung einen neuen Link geben.')}</p>
            <a {...linkProps('/')} className="text-primary underline-offset-4 hover:underline">
              {t('Zur Startseite')}
            </a>
          </div>
        ) : !preview ? (
          <Pokeball label={t('Prüfe Einladung …')} className="py-10" />
        ) : (
          <form onSubmit={join} className="grid gap-5">
            <div>
              <p className="label text-primary">{t(roleLabel[preview.role])}</p>
              <h1 className="mt-2 font-display tracking-tight text-5xl leading-none font-extrabold">{preview.challenge_name}</h1>
            </div>
            {preview.member_name ? (
              <p className="text-muted-foreground">
                {t('Dieser Link verbindet dieses Gerät mit dem Platz von')}{' '}
                <strong className="text-foreground">{preview.member_name}</strong>.
              </p>
            ) : (
              <Field label={t('Dein Name')}>
                <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} autoFocus />
              </Field>
            )}
            <p className="text-xs text-muted-foreground">
              {t(
                'Kein Konto, kein Passwort: Dein Browser merkt sich die Verbindung. Für ein weiteres Gerät erstellst du dir später in den Einstellungen einen eigenen Link.',
              )}
            </p>
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? t('Verbinde …') : t('Beitreten')}
            </Button>
          </form>
        )}
      </motion.div>
    </main>
  )
}
