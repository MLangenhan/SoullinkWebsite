import { useT } from '@/lib/i18n'

/** Wird angezeigt, solange VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY fehlen. */
export function Setup() {
  const t = useT()
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-4 pt-24">
      <p className="label text-primary">{t('Einrichtung')}</p>
      <h1 className="font-display tracking-tight text-5xl font-extrabold">{t('Supabase fehlt noch')}</h1>
      <p className="text-muted-foreground">
        {t('Lege eine Datei')} <code className="font-mono text-foreground">.env.local</code> {t('an (Vorlage:')}{' '}
        <code className="font-mono text-foreground">.env.example</code>
        {t(') bzw. setze sie auf GitHub unter Settings → Secrets and variables → Actions → Variables (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY):')}
      </p>
      <pre className="overflow-x-auto rounded-lg border bg-card p-4 font-mono text-sm">
        VITE_SUPABASE_URL=https://&lt;{t('projekt-ref')}&gt;.supabase.co{'\n'}VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
      </pre>
      <p className="text-sm text-muted-foreground">{t('Schritt für Schritt: README.md im Repository.')}</p>
    </main>
  )
}
