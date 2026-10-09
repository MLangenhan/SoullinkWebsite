import { expect, test } from '@playwright/test'
import { inviteHash, join, tab, watchErrors } from './helpers'

// Die Tests bauen aufeinander auf: Ein Einladungslink gilt nur einmal, der erste Test verbraucht Moritz' Link
test.describe.configure({ mode: 'serial' })

test('Beitritt per Link: Kopf, alle Bereiche und Content Security Policy ohne Fehler', async ({ page }) => {
  const errors = watchErrors(page)
  await join(page, 'Moritz')

  // Produktions-Build mit CSP (Skripte nur vom eigenen Ursprung, Trusted Types)
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /script-src 'self'.*require-trusted-types-for/)

  // Kopf zählt Soul-Links: 52 lebende und 8 tote Pokémon bei vier Spielern
  const header = page.locator('main header').first()
  await expect(header.getByText('Lebende Links').locator('..')).toContainText('13')
  await expect(header.getByText('Verlorene Links').locator('..')).toContainText('2')
  await expect(header).toContainText('Orden 1 – Viola City (Falk)')

  for (const name of ['Gebiete', 'Teams', 'Pokédex', 'Calc', 'Friedhof', 'Timeline', 'Zähler', 'Einstellungen', 'Routen']) {
    await tab(page, name).click()
    await expect(tab(page, name)).toHaveAttribute('aria-current', 'page')
  }
  await expect(page.getByText('Steineichenwald').first()).toBeVisible()
  expect(errors).toEqual([])
})

test('Level-Cap: + und − springen durch die Vorlage des Spiels', async ({ page }) => {
  await join(page, 'Janne')
  const header = page.locator('main header').first()
  await page.getByRole('button', { name: 'Nächster Level-Cap' }).click()
  await expect(header).toContainText('Orden 2 – Azalea City (Kai)')
  await expect(header).toContainText('17')
  await page.getByRole('button', { name: 'Vorheriger Level-Cap' }).click()
  await expect(header).toContainText('Orden 1 – Viola City (Falk)')
})

test('Offene Gebiete: Eintragen aus der Liste hakt das Gebiet ab', async ({ page }) => {
  const errors = watchErrors(page)
  await join(page, 'Elsmann')
  await tab(page, 'Gebiete').click()
  const progress = page.getByText('Gebiete erledigt').locator('..')
  const before = Number((await progress.innerText()).match(/(\d+)\s*\/\s*\d+/)?.[1])

  await page.getByPlaceholder('Gebiet suchen …').fill('Eispfad')
  await page.getByRole('button', { name: 'Eispfad eintragen' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('input[list]')).toHaveValue('Eispfad')
  for (const button of await dialog.getByRole('button', { name: 'Verpasst' }).all()) await button.click()
  await dialog.getByRole('button', { name: /Speichern/ }).click()
  await expect(dialog).toBeHidden()

  await expect(page.getByRole('listitem').filter({ hasText: 'Eispfad' })).toHaveCount(0)
  await expect(progress).toContainText(`${before + 1} /`)
  expect(errors).toEqual([])
})

test('Englisch: Routen, Level-Caps und Eintragen über den englischen Namen', async ({ page }) => {
  await join(page, 'Linus')
  await page.getByRole('button', { name: 'EN', exact: true }).click()

  await expect(page.getByText('Ilex Forest').first()).toBeVisible()
  await expect(page.getByText('Sprout Tower').first()).toBeVisible()
  await expect(page.locator('main header').first()).toContainText('Badge 1 – Violet City (Falkner)')

  // „Ilex Forest“ ist die bestehende Route „Steineichenwald“: keine Doppelroute, alle schon eingetragen
  await page.getByRole('button', { name: 'Log encounter' }).first().click()
  await page.getByRole('dialog').locator('input[list]').fill('Ilex Forest')
  await expect(page.getByRole('dialog').getByText('already logged')).toHaveCount(4)
})

test.describe('Sicherheit', () => {
  test('ein Einladungslink lässt sich nur einmal nutzen', async ({ page }) => {
    await page.goto(`join${inviteHash('Moritz')}`)
    await expect(page.getByText('Einladung ungültig oder abgelaufen')).toBeVisible()
  })

  test('ohne verbundenes Gerät bleibt eine private Challenge unsichtbar', async ({ page }) => {
    await page.goto('c/demo-soulsilver-alle')
    await expect(page.getByText('Keine Challenge unter dieser Adresse')).toBeVisible()
  })

  test('die Website lädt nichts von Google oder anderen Dritten außer Supabase und den Sprites', async ({ page }) => {
    const origins = new Set<string>()
    page.on('request', (request) => origins.add(new URL(request.url()).hostname))
    await page.goto('')
    await page.waitForLoadState('networkidle')
    const allowed = ['localhost', '127.0.0.1', 'raw.githubusercontent.com']
    expect([...origins].filter((host) => !allowed.includes(host) && !host.endsWith('.supabase.co'))).toEqual([])
  })
})
