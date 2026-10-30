import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, type Page } from '@playwright/test'

/** Einladungs-Hash (#inv_…) eines Demo-Spielers aus global-setup.ts */
export function inviteHash(name: 'Moritz' | 'Janne' | 'Elsmann' | 'Linus'): string {
  const links = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '.links.json'), 'utf8')) as Record<string, string>
  return links[name]
}

/**
 * Neue, einmal nutzbare Einladung für einen Demo-Spieler direkt in der lokalen Datenbank: Die Links aus
 * global-setup.ts sind nach dem ersten Test verbraucht, weitere Tests brauchen trotzdem z. B. die Leitung.
 */
export function freshInviteHash(name: Parameters<typeof inviteHash>[0]): string {
  const token = `inv_${randomBytes(32).toString('base64url')}`
  const database = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:54322/postgres'
  const sql = `insert into public.challenge_invites (challenge_id, token_hash, role, member_id, max_uses, expires_at)
    select m.challenge_id, sha256(convert_to(:'token', 'UTF8')), m.role, m.id, 1, now() + interval '1 hour'
    from public.challenge_members m join public.challenges c on c.id = m.challenge_id
    where c.slug = 'demo-soulsilver-alle' and m.display_name = :'name'`
  execFileSync('psql', [database, '-qtAX', '-v', 'ON_ERROR_STOP=1', '-v', `token=${token}`, '-v', `name=${name}`], { input: sql })
  return `#${token}`
}

/** Sammelt Fehler im Browser: Ausnahmen, Konsolenfehler und Verstöße gegen die Content Security Policy */
export function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(`console: ${message.text()}`)
  })
  void page.addInitScript(() =>
    document.addEventListener('securitypolicyviolation', (event) => console.error(`CSP: ${event.violatedDirective} ${event.blockedURI}`)),
  )
  return errors
}

/** Mit dem persönlichen Link beitreten und auf der Challenge landen */
export async function join(page: Page, name: Parameters<typeof inviteHash>[0], hash = inviteHash(name)) {
  await page.goto(`join${hash}`)
  await page.getByRole('button', { name: /beitreten|join/i }).click()
  await expect(page).toHaveURL(/\/c\/demo-soulsilver-alle/)
  await expect(page.getByText(/Level-Cap|Level cap/).first()).toBeVisible()
}

export function tab(page: Page, name: string) {
  return page.getByRole('navigation').last().getByRole('button', { name, exact: true })
}
