import { LayoutGroup, motion } from 'motion/react'
import { Sprite } from '@/components/Sprite'
import type { ChallengeData } from '@/hooks/useChallenge'
import { speciesName, type Lookups } from '@/lib/describe'
import type { SpeciesIndex } from '@/lib/species'
import type { Encounter } from '@/lib/types'

/** Team und Box je Spieler. Wechselt ein Pokémon, fliegt es animiert an seinen neuen Platz. */
export function TeamsPanel({ data, species, lookups }: { data: ChallengeData; species: SpeciesIndex | null; lookups: Lookups }) {
  return (
    <LayoutGroup>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {data.players.map((player) => {
          const own = data.encounters.filter((e) => e.member_id === player.id)
          const team = own.filter((e) => e.state === 'team')
          const box = own.filter((e) => e.state === 'box')
          const lost = own.filter((e) => e.state === 'dead' || e.state === 'linked_dead').length
          return (
            <section key={player.id} className="soft-card rounded-2xl p-5">
              <header className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-display tracking-tight text-2xl font-extrabold">
                  <span className="size-2.5 rounded-full" style={{ background: player.color ?? 'var(--primary)' }} />
                  {player.display_name}
                </h3>
                <span className="label text-muted-foreground">{lost} verloren</span>
              </header>
              <p className="label mb-2 text-ok">Team · {team.length}</p>
              <Slots items={team} species={species} lookups={lookups} large />
              <p className="label mt-5 mb-2 text-box">Box · {box.length}</p>
              <Slots items={box} species={species} lookups={lookups} />
            </section>
          )
        })}
      </div>
    </LayoutGroup>
  )
}

function Slots({ items, species, lookups, large }: { items: Encounter[]; species: SpeciesIndex | null; lookups: Lookups; large?: boolean }) {
  if (items.length === 0) return <p className="rounded-lg border border-dashed py-4 text-center text-sm text-muted-foreground">leer</p>
  return (
    <div className={large ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-4 gap-1'}>
      {items.map((e) => {
        const name = e.nickname ?? speciesName(species, e.species_id)
        return (
          <motion.div
            key={e.encounter_id}
            layoutId={e.encounter_id}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="flex flex-col items-center rounded-lg bg-background/50 p-1.5 text-center"
            title={`${name} · ${lookups.routes.get(e.route_id)?.name ?? ''}`}
          >
            <Sprite id={e.species_id} name={name} state={e.state} size={large ? 'md' : 'sm'} />
            <span className="w-full truncate text-xs">{name}</span>
          </motion.div>
        )
      })}
    </div>
  )
}
