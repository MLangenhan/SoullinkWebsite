import { expect, test } from '@playwright/test'
import { freshInviteHash, join, tab, watchErrors } from './helpers'

// OBS-Overlay: Die Leitung stellt im Baukasten ein Overlay zusammen, OBS öffnet den Link ohne Sitzung
test('OBS-Overlay: Link erstellen, ohne Sitzung anzeigen, widerrufen', async ({ page, browser }) => {
  const errors = watchErrors(page)
  await join(page, 'Moritz', freshInviteHash('Moritz'))
  await tab(page, 'Einstellungen').click()

  const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'OBS-Overlay' }) })
  await section.getByRole('button', { name: 'Alles', exact: true }).click()
  await expect(section.getByText('Letzter Soul-Link').first()).toBeVisible()
  await section.getByRole('button', { name: 'Overlay-Link erstellen' }).click()

  const url = (await section.locator('code').first().innerText()).trim()
  expect(url).toMatch(/\/obs\?w=stats,cap,link,team#slo_[A-Za-z0-9_-]{40,}$/)

  // Wie OBS: neuer Browser-Kontext ohne Sitzung und ohne gespeicherte Daten
  const obsContext = await browser.newContext()
  const obs = await obsContext.newPage()
  const obsErrors = watchErrors(obs)
  await obs.goto(url)
  await expect(obs.getByText('Letzter Soul-Link')).toBeVisible()
  await expect(obs.getByText('Lebende Links')).toBeVisible()
  await expect(obs.getByText('Level-Cap')).toBeVisible()
  for (const name of ['Moritz', 'Janne', 'Elsmann', 'Linus']) await expect(obs.getByText(name).first()).toBeVisible()
  // Durchsichtig für OBS, keine Navigation der Website
  expect(await obs.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
  await expect(obs.getByRole('navigation')).toHaveCount(0)

  // Nur zwei Spieler, nebeneinander, ohne Überschriften: andere Adresse, gleiches Token
  await obs.goto(url.replace('w=stats,cap,link,team', 'w=team&p=0,1&dir=row&titles=0'))
  await expect(obs.getByText('Moritz').first()).toBeVisible()
  await expect(obs.getByText('Elsmann')).toHaveCount(0)
  await expect(obs.getByText('Team', { exact: true })).toHaveCount(0)

  // Widerrufen: Das Overlay merkt es bei der nächsten Abfrage
  await section.getByRole('button', { name: 'Widerrufen' }).first().click()
  await expect(obs.getByText(/Overlay-Link ungültig oder widerrufen/)).toBeVisible({ timeout: 15_000 })

  expect(errors).toEqual([])
  expect(obsErrors).toEqual([])
  await obsContext.close()
})
