import { AnimatePresence, motion } from 'motion/react'
import { CopyX } from 'lucide-react'
import type { ChallengeData } from '@/hooks/useChallenge'
import { dupesOf } from '@/lib/dupes'
import { speciesName } from '@/lib/describe'
import { useT } from '@/lib/i18n'
import { speciesLabel, type SpeciesIndex } from '@/lib/species'

/** Warnung beim Eintragen: Entwicklungsreihe ist in diesem Run schon gefangen (Dupes-Clause) */
export function DupeWarning({ speciesId, data, species }: { speciesId: number | null; data: ChallengeData; species: SpeciesIndex }) {
  const t = useT()
  const found = speciesId !== null && data.challenge.dupes_clause ? dupesOf(speciesId, data.encounters, species) : []
  const first = speciesId !== null ? species.chain(speciesId)[0] : undefined
  const line = first ? speciesLabel(first) : ''
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
            <span className="font-medium">{t('Dupe:')}</span> {t('{name}-Reihe schon gefangen', { name: line })} –{' '}
            {found
              .map((e) => {
                const who = data.members.find((m) => m.id === e.member_id)?.display_name ?? t('Jemand')
                const where = data.routes.find((r) => r.id === e.route_id)?.name ?? t('Route')
                return `${e.nickname ?? speciesName(species, e.species_id)} (${where}, ${who})`
              })
              .join(', ')}
          </span>
        </motion.p>
      )}
    </AnimatePresence>
  )
}
