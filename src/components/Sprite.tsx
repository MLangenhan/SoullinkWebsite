import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { animatedSpriteUrl } from '@/lib/species'
import type { PokemonState } from '@/lib/types'
import { cn } from '@/lib/utils'

const sizes = {
  xs: 'size-8',
  sm: 'size-12',
  md: 'size-16',
  lg: 'size-24',
  xl: 'size-36',
} as const

const staticUrl = (id: number) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`

/**
 * Pokémon-Sprite: animiertes GIF (Showdown), sonst das statische Bild.
 * Lebende Pokémon wippen leicht und hüpfen beim Überfahren, tote sind grau und still.
 */
export function Sprite({
  id,
  name,
  size = 'md',
  state,
  idle = true,
  className,
}: {
  id: number
  name: string
  size?: keyof typeof sizes
  state?: PokemonState
  idle?: boolean
  className?: string
}) {
  const reduce = useReducedMotion()
  const [source, setSource] = useState<'animated' | 'static' | 'none'>('animated')
  const dead = state === 'dead' || state === 'linked_dead'
  const alive = !dead && idle && !reduce
  // Leicht versetzter Takt, damit nebeneinanderliegende Sprites nicht synchron wippen
  const [delay] = useState(() => Math.random() * 1.5)

  return (
    <motion.span
      className={cn('relative inline-flex shrink-0 items-end justify-center', sizes[size], className)}
      whileHover={dead || reduce ? undefined : { scale: 1.15, rotate: [0, -6, 6, 0], transition: { duration: 0.4 } }}
    >
      {source === 'none' ? (
        <span className="label flex size-full items-center justify-center rounded-full border border-dashed text-[0.6rem] text-muted-foreground">
          #{id}
        </span>
      ) : (
        <motion.img
          key={source}
          src={source === 'animated' ? animatedSpriteUrl(id) : staticUrl(id)}
          alt={name}
          title={name}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setSource((s) => (s === 'animated' ? 'static' : 'none'))}
          className={cn(
            'pixelated max-h-full max-w-full object-contain drop-shadow-[0_6px_5px_rgba(27,34,48,0.18)] select-none',
            dead && 'opacity-60 grayscale',
            state === 'linked_dead' && 'sepia-[.35]',
          )}
          initial={reduce ? false : { opacity: 0, y: 8, scale: 0.85 }}
          animate={
            alive
              ? { opacity: 1, scale: 1, y: [0, -3, 0], transition: { y: { duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay }, default: { duration: 0.35 } } }
              : { opacity: 1, y: 0, scale: 1 }
          }
        />
      )}
    </motion.span>
  )
}
