import { AnimatePresence, motion } from 'motion/react'
import { CopyX } from 'lucide-react'
import type { ChallengeData } from '@/hooks/useChallenge'
import { dupesOf } from '@/lib/dupes'
import type { SpeciesIndex } from '@/lib/species'

/** Warnung beim Eintragen: Entwicklungsreihe ist in diesem Run schon gefangen (Dupes-Clause) */
export function DupeWarning({ speciesId, data, species }: { speciesId: number | null; data: ChallengeData; species: SpeciesIndex }) {
  const found = speciesId !== null && data.challenge.dupes_clause ? dupesOf(speciesId, data.encounters, species) : []
  const line = speciesId !== null ? species.chain(speciesId)[0]?.name_de : ''
  return (
    <AnimatePresence initial={false}>
      {found.length > 0 && (
        <motion.p
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="flex items-start gap-2 overflow-hidden rounded-md bg-highlight/20 px-3 py-2 text-sm"
          role="alert"
        >
          <CopyX className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-medium">Dupe:</span> {line}-Reihe schon gefangen –{' '}
            {found
              .map((e) => {
                const who = data.members.find((m) => m.id === e.member_id)?.display_name ?? 'Jemand'
                const where = data.routes.find((r) => r.id === e.route_id)?.name ?? 'Route'
                return `${e.nickname ?? species.byId.get(e.species_id)?.name_de} (${where}, ${who})`
              })
              .join(', ')}
          </span>
        </motion.p>
      )}
    </AnimatePresence>
  )
}
