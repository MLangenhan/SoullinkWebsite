import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, type Page } from '@playwright/test'

/** Einladungs-Hash (#inv_…) eines Demo-Spielers aus global-setup.ts */
export function inviteHash(name: 'Moritz' | 'Janne' | 'Elsmann' | 'Linus'): string {
  const links = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '.links.json'), 'utf8')) as Record<string, string>
  return links[name]
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
export async function join(page: Page, name: Parameters<typeof inviteHash>[0]) {
  await page.goto(`join${inviteHash(name)}`)
  await page.getByRole('button', { name: /beitreten|join/i }).click()
  await expect(page).toHaveURL(/\/c\/demo-soulsilver-alle/)
  await expect(page.getByText(/Level-Cap|Level cap/).first()).toBeVisible()
}

export function tab(page: Page, name: string) {
  return page.getByRole('navigation').last().getByRole('button', { name, exact: true })
}
