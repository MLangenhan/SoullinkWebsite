import { useState } from 'react'
import { motion } from 'motion/react'
import { Plus } from 'lucide-react'
import { Counter } from '@/components/fx/Counter'
import { Sprite } from '@/components/Sprite'
import { Button } from '@/components/ui/button'
import type { ChallengeData } from '@/hooks/useChallenge'
import { appendEvent } from '@/lib/actions'
import { toast, toastError } from '@/lib/toast'

/** Alle Zähler des Bots: Tode und verpasste Begegnungen (Run/gesamt), Wipes, Siege. */
export function StatsPanel({ data }: { data: ChallengeData }) {
  const [busy, setBusy] = useState(false)
  const isCurrent = data.shownRun === data.stats.current_run
  const max = Math.max(1, ...data.memberStats.map((m) => m.deaths_total))

  const missed = async (memberId: string, name: string) => {
    setBusy(true)
    try {
      await appendEvent(data.challenge.id, 'encounter_missed', { member_id: memberId })
      toast(`Verpasste Begegnung für ${name} gezählt (rückgängig über die Timeline)`)
    } catch (error) {
      toastError(error)
    } finally {
      setBusy(false)
    }
  }

  const overview = [
    { label: 'Laufender Run', value: data.stats.current_run },
    { label: 'Runs beendet', value: data.stats.runs_finished },
    { label: 'Wipes', value: data.stats.wipes_total },
    { label: 'Siege', value: data.stats.wins_total },
  ]

  return (
    <div className="grid gap-8">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {overview.map((o) => (
          <div key={o.label} className="rounded-xl border bg-card/60 p-5">
            <p className="label text-muted-foreground">{o.label}</p>
            <Counter to={o.value} className="mt-2 block font-display text-6xl font-black" />
          </div>
        ))}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {data.memberStats.map((m, i) => {
          const member = data.members.find((x) => x.id === m.member_id)
          const alive = data.encounters.filter((e) => e.member_id === m.member_id && (e.state === 'team' || e.state === 'box'))
          return (
            <motion.section
              key={m.member_id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-xl border bg-card/60 p-6"
            >
              <header className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 font-display text-3xl font-extrabold uppercase">
                  <span className="size-3 rounded-full" style={{ background: member?.color ?? 'var(--primary)' }} />
                  {m.display_name}
                </h3>
                <div className="flex -space-x-3">
                  {alive.slice(0, 6).map((e) => (
                    <Sprite key={e.encounter_id} id={e.species_id} name="" size="sm" idle={false} />
                  ))}
                </div>
              </header>
              <dl className="mt-5 grid grid-cols-3 gap-4">
                <Stat label="Tode im Run" value={m.deaths_run} sub={`${m.deaths_total} gesamt`} />
                <Stat label="Verpasst im Run" value={m.missed_run} sub={`${m.missed_total} gesamt`} />
                <Stat label="Wipes verursacht" value={m.wipes_caused} />
              </dl>
              <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-secondary" title="Tode gesamt im Vergleich">
                <motion.div
                  className="h-full rounded-full bg-destructive"
                  initial={{ width: 0 }}
                  whileInView={{ width: `${(m.deaths_total / max) * 100}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
              {data.canWrite && isCurrent && (
                <Button variant="ghost" size="sm" className="mt-4" disabled={busy} onClick={() => void missed(m.member_id, m.display_name)}>
                  <Plus /> Verpasste Begegnung
                </Button>
              )}
            </motion.section>
          )
        })}
      </div>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div>
      <dt className="label text-[0.65rem] text-muted-foreground">{label}</dt>
      <dd>
        <Counter to={value} className="font-display text-5xl font-black" />
        {sub && <span className="block text-xs text-muted-foreground">{sub}</span>}
      </dd>
    </div>
  )
}
