import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { t } from '@/lib/i18n'

const SRC = path.resolve(import.meta.dirname, '..')
const dictionaries = import.meta.glob<{ default: Record<string, string> }>('../i18n/*.ts', { eager: true })

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return name === 'test' ? [] : sourceFiles(full)
    return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') ? [full] : []
  })
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('Übersetzungen', () => {
  const merged = new Map<string, { file: string; value: string }>()
  const conflicts: string[] = []
  const brokenPlaceholders: string[] = []
  for (const [file, module] of Object.entries(dictionaries)) {
    for (const [key, value] of Object.entries(module.default)) {
      if (!value.trim() || placeholders(value).join() !== placeholders(key).join()) brokenPlaceholders.push(`${path.basename(file)}: ${key}`)
      const previous = merged.get(key)
      if (previous && previous.value !== value) conflicts.push(`${key}: ${previous.file} ≠ ${file}`)
      merged.set(key, { file, value })
    }
  }

  it('jede Übersetzung ist gefüllt und hat dieselben Platzhalter wie der deutsche Text', () => {
    expect(merged.size).toBeGreaterThan(400)
    expect(brokenPlaceholders).toEqual([])
  })

  it('derselbe deutsche Text ist überall gleich übersetzt', () => {
    expect(conflicts).toEqual([])
  })

  it('jeder feste Text in t(…) hat eine englische Fassung', () => {
    const missing: string[] = []
    for (const file of sourceFiles(SRC)) {
      // Kommentare enthalten Beispiele wie t('{name} ist im Team'), die keine echten Texte sind
      const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      for (const match of code.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) {
        const key = match[1].replace(/\\'/g, "'")
        if (!merged.has(key)) missing.push(`${path.relative(SRC, file)}: ${key}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('setzt Platzhalter ein und lässt unbekannte stehen', () => {
    expect(t('{name} ist da', { name: 'Janne' })).toBe('Janne ist da')
    expect(t('{a} und {b}', { a: 1 })).toBe('1 und {b}')
  })
})
