import { useState } from 'react'
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
 * Tote Pokémon sind grau.
 */
export function Sprite({
  id,
  name,
  size = 'md',
  state,
  className,
}: {
  id: number
  name: string
  size?: keyof typeof sizes
  state?: PokemonState
  className?: string
}) {
  const [source, setSource] = useState<'animated' | 'static' | 'none'>('animated')
  const dead = state === 'dead' || state === 'linked_dead'

  return (
    <span className={cn('relative inline-flex shrink-0 items-end justify-center', sizes[size], className)}>
      {source === 'none' ? (
        <span className="label flex size-full items-center justify-center rounded-full border border-dashed text-[0.6rem] text-muted-foreground">
          #{id}
        </span>
      ) : (
        <img
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
        />
      )}
    </span>
  )
}
