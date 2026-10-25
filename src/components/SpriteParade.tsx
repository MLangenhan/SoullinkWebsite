import { Sprite } from '@/components/Sprite'

/** Reihe aus Pokémon als Deko unter dem Hero. */
export function SpriteParade({ ids, className }: { ids: number[]; className?: string }) {
  return (
    <div className={className} aria-hidden>
      <div className="flex justify-center gap-6 whitespace-nowrap px-3">
        {ids.map((id) => (
          <Sprite key={id} id={id} name={`#${id}`} size="lg" />
        ))}
      </div>
    </div>
  )
}
