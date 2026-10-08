/** Wird angezeigt, solange VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY fehlen. */
export function Setup() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-4 pt-24">
      <p className="label text-primary">Einrichtung</p>
      <h1 className="font-display tracking-tight text-5xl font-extrabold">Supabase fehlt noch</h1>
      <p className="text-muted-foreground">
        Lege eine Datei <code className="font-mono text-foreground">.env.local</code> an (Vorlage:{' '}
        <code className="font-mono text-foreground">.env.example</code>) bzw. setze sie auf GitHub unter Settings → Secrets and
        variables → Actions → Variables (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY):
      </p>
      <pre className="overflow-x-auto rounded-lg border bg-card p-4 font-mono text-sm">
        VITE_SUPABASE_URL=https://&lt;projekt-ref&gt;.supabase.co{'\n'}VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
      </pre>
      <p className="text-sm text-muted-foreground">Schritt für Schritt: README.md im Repository.</p>
    </main>
  )
}
