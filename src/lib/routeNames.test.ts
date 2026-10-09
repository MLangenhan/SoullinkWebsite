import { describe, expect, it } from 'vitest'
import { HGSS } from '@/test/areaData'
import { route } from '@/test/fixtures'
import { buildRouteNames } from '@/lib/routeNames'

describe('buildRouteNames: Routennamen in beiden Sprachen', () => {
  const de = buildRouteNames(HGSS, 'de')
  const en = buildRouteNames(HGSS, 'en')

  it('zeigt Orte des Spiels in der eingestellten Sprache, egal wie sie eingetragen wurden', () => {
    expect(de.display('Ilex Forest')).toBe('Steineichenwald')
    expect(en.display('Steineichenwald')).toBe('Ilex Forest')
    expect(en.display('knofensa turm')).toBe('Sprout Tower')
  })

  it('lässt eigene Namen unverändert', () => {
    expect(en.display('Starter')).toBe('Starter')
    expect(buildRouteNames(null, 'en').display('Steineichenwald')).toBe('Steineichenwald')
  })

  it('findet die bestehende Route auch über die andere Sprache, damit keine Doppelrouten entstehen', () => {
    const routes = [route('r1', 'Steineichenwald'), route('r2', 'Route 29'), route('r3', 'Starter')]
    expect(de.find(routes, 'Ilex Forest')?.id).toBe('r1')
    expect(de.find(routes, '  route 29 ')?.id).toBe('r2')
    expect(de.find(routes, 'STARTER')?.id).toBe('r3')
    expect(de.find(routes, 'Violet City')).toBeUndefined()
    expect(de.find(routes, '   ')).toBeUndefined()
  })

  it('schlägt alle Orte des Spiels in der eingestellten Sprache vor', () => {
    expect(en.suggestions).toContain('Sprout Tower')
    expect(de.suggestions).toContain('Knofensa-Turm')
    expect(de.suggestions).toHaveLength(HGSS.areas.length)
  })
})
