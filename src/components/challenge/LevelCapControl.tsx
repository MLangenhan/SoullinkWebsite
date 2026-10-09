import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Minus, Plus } from 'lucide-react'
import { capIndex, capLabel, presetFor, stepCap } from '@/data/levelCaps'
import type { ChallengeData } from '@/hooks/useChallenge'
import { HeaderStat } from '@/components/challenge/HeaderStat'
import { useT } from '@/lib/i18n'
import { rpc } from '@/lib/supabase'
import { toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'

/** Level-Cap im Kopf der Challenge: − und + springen zum vorherigen bzw. nächsten Cap der Vorlage */
export function LevelCapControl({ data }: { data: ChallengeData }) {
  const t = useT()
  const preset = presetFor(data.challenge)
  const saved = capIndex(data.challenge, data.stats.current_run)
  // Sofort anzeigen, bis die Änderung zurückkommt
  const [pending, setPending] = useState<{ index: number; from: number | null } | null>(null)
  const index = pending && pending.from === saved ? pending.index : saved
  const canEdit = data.canWrite && data.shownRun === data.stats.current_run

  if (!preset || index === null) return null
  const cap = preset.caps[index]
  const prev = stepCap(preset, index, -1)
  const next = stepCap(preset, index, 1)
  const direction = pending ? Math.sign(pending.index - (pending.from ?? 0)) : 0

  const go = async (target: number | null) => {
    if (target === null) return
    setPending({ index: target, from: saved })
    try {
      await rpc('set_level_cap', { p_challenge_id: data.challenge.id, p_index: target })
    } catch (error) {
      toastError(error)
      setPending(null)
    }
  }

  return (
    <HeaderStat label={t('Level-Cap')} caption={<span title={capLabel(cap)}>{capLabel(cap)}</span>}>
      <div className="flex items-center gap-1.5">
        {canEdit && (
          <StepButton label={t('Vorheriger Level-Cap')} disabled={prev === null} onClick={() => void go(prev)}>
            <Minus className="size-4" />
          </StepButton>
        )}
        <span className="relative inline-flex min-w-[2.6ch] justify-center overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <motion.span
              key={cap.level}
              custom={direction}
              initial={{ y: direction >= 0 ? 28 : -28, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: direction >= 0 ? -28 : 28, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              className="font-display tracking-tight text-6xl leading-none font-extrabold text-primary tabular-nums"
            >
              {cap.level}
            </motion.span>
          </AnimatePresence>
        </span>
        {canEdit && (
          <StepButton label={t('Nächster Level-Cap')} disabled={next === null} onClick={() => void go(next)}>
            <Plus className="size-4" />
          </StepButton>
        )}
      </div>
    </HeaderStat>
  )
}

function StepButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      whileTap={{ scale: 0.85 }}
      className={cn(
        'flex size-8 items-center justify-center rounded-full border bg-card text-foreground shadow-sm transition-colors hover:border-primary hover:text-primary',
        'disabled:pointer-events-none disabled:opacity-30',
      )}
    >
      {children}
    </motion.button>
  )
}
