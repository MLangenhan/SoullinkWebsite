import { useState } from 'react'
import { Skull, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/input'
import type { ChallengeData } from '@/hooks/useChallenge'
import { appendEvent } from '@/lib/actions'
import { toast, toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'

export function EndRunDialog({
  open,
  onOpenChange,
  data,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: ChallengeData
}) {
  const [result, setResult] = useState<'wipe' | 'won'>('wipe')
  const [culprit, setCulprit] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const run = data.stats.current_run

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await appendEvent(data.challenge.id, 'run_ended', {
        result,
        caused_by_member_id: result === 'wipe' && culprit ? culprit : null,
        note: note || null,
      })
      toast(result === 'won' ? `Run ${run} gewonnen! Glückwunsch!` : `Run ${run} ist vorbei. Run ${run + 1} beginnt.`)
      onOpenChange(false)
      setCulprit('')
      setNote('')
    } catch (error) {
      toastError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-4xl font-black uppercase">Run {run} beenden</DialogTitle>
          <DialogDescription>
            Danach beginnt Run {run + 1}; die Zähler des Runs starten wieder bei null. Rückgängig geht nur, solange im neuen
            Run noch nichts eingetragen ist.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                { value: 'wipe', label: 'Wipe', icon: Skull, active: 'border-destructive bg-destructive/10 text-destructive' },
                { value: 'won', label: 'Gewonnen', icon: Trophy, active: 'border-primary bg-primary/10 text-primary' },
              ] as const
            ).map(({ value, label, icon: Icon, active }) => (
              <button
                key={value}
                type="button"
                onClick={() => setResult(value)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border p-5 transition-colors',
                  result === value ? active : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-7" />
                <span className="font-display text-2xl font-extrabold uppercase">{label}</span>
              </button>
            ))}
          </div>
          {result === 'wipe' && (
            <Field label="Wer war schuld?" hint="Optional, zählt in der Statistik als verursachter Wipe.">
              <Select value={culprit} onChange={(e) => setCulprit(e.target.value)}>
                <option value="">Niemand bestimmtes</option>
                {data.players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Notiz">
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Top 4, Lucian …" />
          </Field>
          <Button type="submit" size="lg" variant={result === 'wipe' ? 'destructive' : 'default'} disabled={busy}>
            {busy ? 'Speichere …' : result === 'wipe' ? 'Wipe bestätigen' : 'Sieg eintragen'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
