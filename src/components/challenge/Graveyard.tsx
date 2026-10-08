import { motion } from 'motion/react'
import { Sprite } from '@/components/Sprite'
import type { ChallengeData } from '@/hooks/useChallenge'
import { formatTime, speciesName, type Lookups } from '@/lib/describe'
import type { SpeciesIndex } from '@/lib/species'

/** Friedhof: ein Grabstein pro gestorbenem Pokémon, mit den Partnern, die es mitgerissen hat. */
export function Graveyard({ data, species, lookups }: { data: ChallengeData; species: SpeciesIndex | null; lookups: Lookups }) {
  const graves = data.encounters
    .filter((e) => e.state === 'dead')
    .sort((a, b) => (b.lost_at ?? '').localeCompare(a.lost_at ?? ''))

  if (graves.length === 0) {
    return (
      <div className="rounded-xl border border-dashed px-6 py-16 text-center text-muted-foreground">
        <p className="text-lg text-foreground">Der Friedhof ist leer.</p>
        <p className="mt-1">Möge es so bleiben.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {graves.map((grave, i) => {
        const name = grave.nickname ?? speciesName(species, grave.species_id)
        const partners = data.encounters.filter((e) => e.link_id === grave.link_id && e.encounter_id !== grave.encounter_id)
        return (
          <motion.article
            key={grave.encounter_id}
            initial={{ opacity: 0, y: 40, rotate: -2 }}
            whileInView={{ opacity: 1, y: 0, rotate: 0 }}
            viewport={{ once: true, margin: '-5% 0px' }}
            transition={{ duration: 0.7, delay: (i % 4) * 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex flex-col items-center rounded-t-[999px] rounded-b-lg border border-border bg-grave px-5 pt-10 pb-5 text-center shadow-[inset_0_-40px_60px_-40px_rgba(0,0,0,0.6)]"
          >
            <span className="label absolute top-4 text-[0.6rem] text-muted-foreground">R.I.P.</span>
            <Sprite id={grave.species_id} name={name} state="dead" size="lg" />
            <h3 className="mt-2 font-display text-3xl font-extrabold uppercase">{name}</h3>
            <p className="text-sm text-muted-foreground">
              {lookups.members.get(grave.member_id)?.display_name} · {lookups.routes.get(grave.route_id)?.name}
            </p>
            <dl className="mt-4 grid w-full gap-1 border-t pt-3 text-left text-sm">
              {grave.death_cause && <Row label="Ursache" value={grave.death_cause} />}
              {grave.death_opponent && <Row label="Gegner" value={grave.death_opponent} />}
              {grave.death_level && <Row label="Level" value={String(grave.death_level)} />}
              {grave.death_route_id && <Row label="Ort" value={lookups.routes.get(grave.death_route_id)?.name ?? '–'} />}
              {grave.lost_at && <Row label="Wann" value={formatTime(grave.lost_at)} />}
            </dl>
            {partners.length > 0 && (
              <div className="mt-4 w-full border-t pt-3">
                <p className="label mb-1 text-[0.6rem] text-destructive/80">Mitgerissen</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {partners.map((p) => (
                    <span key={p.encounter_id} className="flex flex-col items-center text-xs text-muted-foreground">
                      <Sprite id={p.species_id} name={speciesName(species, p.species_id)} state={p.state} size="sm" />
                      {lookups.members.get(p.member_id)?.display_name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </motion.article>
        )
      })}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="label text-[0.65rem] text-muted-foreground">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  )
}
