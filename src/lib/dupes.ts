import type { SpeciesIndex } from '@/lib/species'
import type { Encounter } from '@/lib/types'

/** Gleiche Entwicklungsreihe? (Taubsi, Tauboga, Tauboss) */
export function sameLine(species: SpeciesIndex, a: number, b: number) {
  const ca = species.byId.get(a)?.evolution_chain_id
  return ca !== undefined && ca === species.byId.get(b)?.evolution_chain_id
}

/**
 * Dupes-Clause (für alle Spieler zusammen): Begegnungen des Runs aus derselben Entwicklungsreihe,
 * egal ob gefangene Vorstufe oder aktuelle Entwicklung, auch tote.
 */
export function dupesOf(speciesId: number, encounters: Encounter[], species: SpeciesIndex): Encounter[] {
  return encounters.filter((e) => sameLine(species, speciesId, e.caught_species_id) || sameLine(species, speciesId, e.species_id))
}
