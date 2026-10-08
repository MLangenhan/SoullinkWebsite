import { motion, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'

/** Pokéball als Ladeanzeige: wackelt wie beim Fangen. */
export function Pokeball({ className, label = 'Lädt …' }: { className?: string; label?: string }) {
  const reduce = useReducedMotion()
  return (
    <div className={cn('flex flex-col items-center gap-4 text-muted-foreground', className)} role="status">
      <motion.svg
        viewBox="0 0 32 32"
        className="size-12"
        animate={reduce ? undefined : { rotate: [0, -18, 18, -10, 0] }}
        transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 0.4, ease: 'easeInOut' }}
        style={{ originY: 0.9 }}
        aria-hidden
      >
        <circle cx="16" cy="16" r="14" fill="var(--card)" />
        <path d="M2.5 16a13.5 13.5 0 0 1 27 0z" fill="var(--pokeball)" />
        <circle cx="16" cy="16" r="14" fill="none" stroke="var(--foreground)" strokeWidth="2.5" />
        <path d="M2.5 16h27" stroke="var(--foreground)" strokeWidth="2.5" />
        <circle cx="16" cy="16" r="4.5" fill="var(--card)" stroke="var(--foreground)" strokeWidth="2.5" />
      </motion.svg>
      <span className="label">{label}</span>
    </div>
  )
}
