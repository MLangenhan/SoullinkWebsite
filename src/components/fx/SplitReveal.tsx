import { motion, useReducedMotion, type Variants } from 'motion/react'
import { cn } from '@/lib/utils'

type Props = {
  text: string
  className?: string
  delay?: number
  /** "chars" für einzelne Buchstaben, "words" für Wörter */
  by?: 'chars' | 'words'
  once?: boolean
}

const part: Variants = {
  hidden: { y: '110%', rotate: 4 },
  show: (d: number) => ({
    y: '0%',
    rotate: 0,
    transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: d },
  }),
}

/**
 * Überschrift, deren Buchstaben/Wörter aus einer Maske nach oben gleiten.
 * Die Sichtbarkeit misst der äußere Container – die einzelnen Teile sind
 * anfangs komplett von ihrer Maske verdeckt und würden sonst nie als
 * "sichtbar" erkannt.
 */
export function SplitReveal({ text, className, delay = 0, by = 'words', once = true }: Props) {
  const reduce = useReducedMotion()
  const parts = by === 'chars' ? text.split('') : text.split(' ')
  const step = by === 'chars' ? 0.035 : 0.07

  return (
    <motion.span
      className={cn('inline-block', className)}
      aria-label={text}
      initial={reduce ? false : 'hidden'}
      whileInView="show"
      viewport={{ once, margin: '-8% 0px' }}
    >
      {parts.map((p, i) => (
        <span key={i} aria-hidden className="inline-block overflow-hidden pb-[0.08em] align-bottom">
          <motion.span className="inline-block will-change-transform" variants={part} custom={delay + i * step}>
            {p === ' ' ? ' ' : p}
            {by === 'words' && i < parts.length - 1 ? ' ' : ''}
          </motion.span>
        </span>
      ))}
    </motion.span>
  )
}
