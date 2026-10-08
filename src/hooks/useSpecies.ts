import { useEffect, useState } from 'react'
import { loadSpecies, type SpeciesIndex } from '@/lib/species'

export function useSpecies(): SpeciesIndex | null {
  const [index, setIndex] = useState<SpeciesIndex | null>(null)
  useEffect(() => {
    let active = true
    loadSpecies()
      .then((loaded) => active && setIndex(loaded))
      .catch(() => active && setIndex(null))
    return () => {
      active = false
    }
  }, [])
  return index
}
