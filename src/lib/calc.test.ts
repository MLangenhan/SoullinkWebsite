import { describe, expect, it } from 'vitest'
import { compute, emptyField, emptySide, generation } from '@/lib/calc'

// Schadensrechner auf @smogon/calc: nur Eigenschaften, keine festen Schadenszahlen
describe('Schadensrechner', () => {
  const gen = generation(4)
  const attacker = { ...emptySide(50), moves: ['Ice Fang', 'Bite', 'Swords Dance', ''] }
  const defender = emptySide(50)

  it('findet Pokémon über den englischen Namen', () => {
    expect(gen.speciesName('Garchomp')).toBe('Garchomp')
    expect(gen.speciesName('Gibtsnicht')).toBeNull()
  })

  it('rechnet beide Richtungen; Statusattacken machen keinen Schaden', () => {
    const result = compute(gen, 'Weavile', attacker, 'Garchomp', defender, emptyField())
    expect(result.leftToRight).toHaveLength(3)
    expect(result.leftToRight[2]).toMatchObject({ move: 'Swords Dance', status: true, max: 0 })
    expect(result.rightToLeft).toEqual([])
    expect(result.leftSpeed).toBeGreaterThan(result.rightSpeed)
  })

  it('vierfache Schwäche wirkt (Eis gegen Drache/Boden)', () => {
    const [iceFang, bite] = compute(gen, 'Weavile', attacker, 'Garchomp', defender, emptyField()).leftToRight
    expect(iceFang.max).toBeGreaterThan(bite.max * 2.5)
  })

  it('Randomizer: eigene Typen überschreiben die Originaldaten', () => {
    const water = { ...defender, override: { enabled: true, types: ['Water'], stats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 } } }
    const [original] = compute(gen, 'Weavile', attacker, 'Garchomp', defender, emptyField()).leftToRight
    const [randomized] = compute(gen, 'Weavile', attacker, 'Garchomp', water, emptyField()).leftToRight
    // Eis gegen reines Wasser: 0,5 statt 4 – ein Achtel (Rundung)
    expect(randomized.max).toBeLessThanOrEqual(Math.ceil(original.max / 8) + 1)
  })

  it('Randomizer: zwei eigene Typen ersetzen beide Originaltypen', () => {
    const dual = { ...defender, override: { enabled: true, types: ['Fire', 'Flying'], stats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 } } }
    const [neutral] = compute(gen, 'Weavile', attacker, 'Garchomp', { ...defender, override: { ...dual.override, types: ['Normal'] } }, emptyField()).leftToRight
    const [iceFang] = compute(gen, 'Weavile', attacker, 'Garchomp', dual, emptyField()).leftToRight
    // Feuer 0,5 × Flug 2 = neutral
    expect(iceFang.max).toBe(neutral.max)
  })

  it('Volltreffer erhöht den Schaden', () => {
    const [normal] = compute(gen, 'Weavile', attacker, 'Garchomp', defender, emptyField()).leftToRight
    const [crit] = compute(gen, 'Weavile', attacker, 'Garchomp', defender, { ...emptyField(), crit: true }).leftToRight
    expect(crit.min).toBeGreaterThan(normal.min)
  })
})
