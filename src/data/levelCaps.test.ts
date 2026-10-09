import { describe, expect, it } from 'vitest'
import { capIndex, capLabel, capLevel, detectPreset, firstCap, LEVEL_CAP_PRESETS, presetFor, stepCap, versionGroupFor } from '@/data/levelCaps'

const preset = (key: string) => LEVEL_CAP_PRESETS.find((p) => p.key === key)!
const levels = (key: string) => preset(key).caps.map((c) => c.level)

describe('Level-Cap-Vorlagen', () => {
  it('haben eindeutige Schlüssel, Namen auf Deutsch und Englisch und plausible Level', () => {
    expect(new Set(LEVEL_CAP_PRESETS.map((p) => p.key)).size).toBe(LEVEL_CAP_PRESETS.length)
    for (const p of LEVEL_CAP_PRESETS) {
      for (const cap of p.caps) {
        expect(cap.label.length).toBeGreaterThan(0)
        expect(cap.labelEn.length).toBeGreaterThan(0)
        if (cap.level !== null) expect(cap.level).toBeGreaterThanOrEqual(5)
        if (cap.level !== null) expect(cap.level).toBeLessThanOrEqual(100)
      }
    }
  })

  // Laufende Challenges speichern den Index; die Länge darf sich nie ändern
  it.each([
    ['kanto_rby', 13], ['kanto_yellow', 13], ['kanto_frlg', 13], ['johto_gsc', 23], ['johto_hgss', 23], ['hoenn_rs', 13],
    ['hoenn_rse', 13], ['hoenn_oras', 13], ['sinnoh_dp', 13], ['sinnoh_pt', 13], ['einall_bw', 13], ['einall_bw2', 13], ['kalos', 13],
  ])('%s hat %i Einträge', (key, count) => {
    expect(preset(key).caps).toHaveLength(count)
  })

  // Geprüft gegen die Trainerdaten der pret-Disassemblies
  it('HeartGold/SoulSilver entspricht den Spieldaten', () => {
    expect(levels('johto_hgss')).toEqual([13, 17, 19, 25, 31, 35, 34, 41, 42, 44, 46, 47, 50, null, 54, 54, 53, 56, 50, 55, 59, 60, 88])
  })

  it('Platin entspricht den Spieldaten, mit Lamina vor Hilda', () => {
    expect(levels('sinnoh_pt')).toEqual([14, 22, 26, 32, 37, 41, 44, 50, 53, 55, 57, 59, 62])
    expect(preset('sinnoh_pt').caps[2].label).toBe('Orden 3 – Herzhofen (Lamina)')
    expect(preset('sinnoh_pt').caps[2].labelEn).toBe('Badge 3 – Hearthome City (Fantina)')
  })

  it('Johto: Hartwig in Anemonia City, Jasmin in Oliviana City', () => {
    expect(preset('johto_hgss').caps[4].label).toBe('Orden 5 – Anemonia City (Hartwig)')
    expect(preset('johto_hgss').caps[5].label).toBe('Orden 6 – Oliviana City (Jasmin)')
  })
})

describe('Spiel am Namen erkennen', () => {
  it.each([
    ['Soul Silver Randomizer', 'johto_hgss'],
    ['Pokémon Platin', 'sinnoh_pt'],
    ['Pokemon Schwarz 2', 'einall_bw2'],
    ['Pokemon Schwarz', 'einall_bw'],
    ['Gelbe Edition', 'kanto_yellow'],
    ['Pokémon Smaragd', 'hoenn_rse'],
    ['Rubin', 'hoenn_rs'],
    ['Omega Rubin', 'hoenn_oras'],
  ])('%s → %s', (game, key) => {
    expect(detectPreset(game)?.key).toBe(key)
  })

  it('erkennt Unbekanntes nicht und respektiert "keine Vorlage"', () => {
    expect(detectPreset('Pokémon Karmesin')).toBeNull()
    expect(presetFor({ game: 'Platin', level_cap_preset: 'none' })).toBeNull()
    expect(presetFor({ game: 'Platin', level_cap_preset: 'johto_hgss' })?.key).toBe('johto_hgss')
    expect(versionGroupFor({ game: 'Platin', level_cap_preset: 'none' })).toBe('platinum')
  })
})

describe('Level-Cap schrittweise', () => {
  const hgss = preset('johto_hgss')

  it('+ und − überspringen Zwischenüberschriften und halten an den Enden', () => {
    expect(firstCap(hgss)).toBe(0)
    expect(stepCap(hgss, 12, 1)).toBe(14)
    expect(stepCap(hgss, 14, -1)).toBe(12)
    expect(stepCap(hgss, 0, -1)).toBeNull()
    expect(stepCap(hgss, hgss.caps.length - 1, 1)).toBeNull()
  })

  it('ein neuer Run beginnt wieder beim ersten Cap', () => {
    const challenge = { game: 'SoulSilver', level_cap_preset: null, level_cap_index: 7, level_cap_run: 1 }
    expect(capIndex(challenge, 1)).toBe(7)
    expect(capLevel(challenge, 1)).toBe(41)
    expect(capIndex(challenge, 2)).toBe(0)
    expect(capLabel(hgss.caps[7])).toBe('Orden 8 – Ebenholz City (Sandra)')
  })
})
