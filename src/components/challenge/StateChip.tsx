import type { PokemonState } from '@/lib/types'
import { cn } from '@/lib/utils'

const stateLabel: Record<PokemonState, string> = {
  team: 'Team',
  box: 'Box',
  dead: 'Tot',
  linked_dead: 'Mitgestorben',
}

const stateClass: Record<PokemonState, string> = {
  team: 'border-ok/40 text-ok',
  box: 'border-box/40 text-box',
  dead: 'border-destructive/50 text-destructive',
  linked_dead: 'border-destructive/30 text-destructive/80',
}

export function StateChip({ state }: { state: PokemonState }) {
  return <span className={cn('label rounded border px-1.5 py-0.5 text-[0.6rem]', stateClass[state])}>{stateLabel[state]}</span>
}
