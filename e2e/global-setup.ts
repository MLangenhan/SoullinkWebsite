import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Spielt die SoulSilver-Demo (vier Spieler, alle verbunden, Run 2 läuft) in die lokale Supabase ein und
 * merkt sich die persönlichen Einladungslinks. Erneutes Ausführen ersetzt die alte Demo.
 */
export default function globalSetup() {
  const root = path.resolve(import.meta.dirname, '..')
  const database = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:54322/postgres'
  const output = execFileSync('psql', [database, '-tAX', '-v', 'ON_ERROR_STOP=1'], {
    input: readFileSync(path.join(root, 'supabase/demo/demo_soulsilver.sql')),
    encoding: 'utf8',
  })
  // Zeilen „Name|Rolle|https://…/join#inv_…“: nur das Token zählt, die Adresse kommt aus baseURL
  const links = Object.fromEntries(
    output
      .split('\n')
      .map((line) => line.split('|'))
      .filter((parts) => parts.length === 3 && parts[2].includes('#inv_'))
      .map(([name, , url]) => [name, url.slice(url.indexOf('#'))]),
  )
  if (Object.keys(links).length !== 4) throw new Error(`Demo lieferte ${Object.keys(links).length} statt 4 Einladungslinks:\n${output}`)
  writeFileSync(path.join(root, 'e2e/.links.json'), JSON.stringify(links))
}
