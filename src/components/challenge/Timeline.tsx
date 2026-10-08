import { useState } from 'react'
import { motion } from 'motion/react'
import { Bot, Undo2 } from 'lucide-react'
import { Sprite } from '@/components/Sprite'
import { Button } from '@/components/ui/button'
import type { ChallengeData } from '@/hooks/useChallenge'
import { revertEvent } from '@/lib/actions'
import { describeEvent, formatTime, type Lookups } from '@/lib/describe'
import type { SpeciesIndex } from '@/lib/species'
import { toast, toastError } from '@/lib/toast'
import type { ChallengeEvent } from '@/lib/types'
import { cn } from '@/lib/utils'

const dot = {
  catch: 'bg-ok',
  death: 'bg-destructive',
  run: 'bg-primary',
  neutral: 'bg-muted-foreground',
  undo: 'bg-box',
} as const

/** Alle Ereignisse des Runs, neueste oben. Rückgängig gemachte bleiben sichtbar, aber durchgestrichen. */
export function Timeline({ data, species, lookups }: { data: ChallengeData; species: SpeciesIndex | null; lookups: Lookups }) {
  const [busy, setBusy] = useState<number | null>(null)
  const reverted = new Set(data.events.filter((e) => e.reverts_event_id !== null).map((e) => e.reverts_event_id))
  const current = data.stats.current_run

  // Ein Run-Ende gehört zum beendeten Run; rückgängig nur, solange es das letzte ist
  const canUndo = (e: ChallengeEvent) =>
    data.canWrite &&
    e.type !== 'event_reverted' &&
    !reverted.has(e.id) &&
    (e.type === 'run_ended' ? e.run_number === current - 1 : e.run_number === current)

  const undo = async (e: ChallengeEvent) => {
    setBusy(e.id)
    try {
      await revertEvent(data.challenge.id, e.id)
      toast('Rückgängig gemacht')
    } catch (error) {
      toastError(error)
    } finally {
      setBusy(null)
    }
  }

  if (data.events.length === 0) {
    return <p className="rounded-xl border border-dashed px-6 py-16 text-center text-muted-foreground">Noch nichts passiert in Run {data.shownRun}.</p>
  }

  return (
    <ol className="relative ml-3 border-l">
      {data.events.map((event, i) => {
        const d = describeEvent(event, lookups, species, data.events)
        const isReverted = reverted.has(event.id)
        const actor = event.actor_member_id ? lookups.members.get(event.actor_member_id)?.display_name : null
        return (
          <motion.li
            key={event.id}
            initial={{ opacity: 0, x: -12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: Math.min(i, 8) * 0.03 }}
            className="relative py-3 pl-6"
          >
            <span className={cn('absolute top-5 -left-[5px] size-2.5 rounded-full ring-4 ring-background', dot[d.tone])} />
            <div className="flex items-center gap-3">
              {d.speciesId !== null && (
                <Sprite id={d.speciesId} name="" size="sm" state={d.tone === 'death' ? 'dead' : undefined} idle={false} />
              )}
              <div className="min-w-0 flex-1">
                <p className={cn(isReverted && 'text-muted-foreground line-through')}>{d.text}</p>
                <p className="label mt-0.5 flex flex-wrap items-center gap-x-2 text-[0.6rem] text-muted-foreground">
                  <span>#{event.seq}</span>
                  <span>{formatTime(event.occurred_at)}</span>
                  {actor && <span>von {actor}</span>}
                  {event.source === 'bot' && (
                    <span className="flex items-center gap-1">
                      <Bot className="size-3" /> Discord{event.actor_discord_id ? ` (${event.actor_discord_id})` : ''}
                    </span>
                  )}
                  {event.source === 'migration' && <span>Altdaten</span>}
                </p>
              </div>
              {canUndo(event) && (
                <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => void undo(event)} aria-label="Rückgängig machen">
                  <Undo2 /> <span className="hidden sm:inline">Rückgängig</span>
                </Button>
              )}
            </div>
          </motion.li>
        )
      })}
    </ol>
  )
}
