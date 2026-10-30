import { expect, test } from '@playwright/test'
import { freshInviteHash, join, tab, watchErrors } from './helpers'

// OBS-Overlay: Im Baukasten ein Overlay zusammenstellen, OBS öffnet den Link ohne Sitzung
test('OBS-Overlay: Link erstellen, ohne Sitzung anzeigen, Gerätebindung, erneuern, widerrufen', async ({ page, browser }) => {
  const errors = watchErrors(page)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await join(page, 'Moritz', freshInviteHash('Moritz'))
  await tab(page, 'Einstellungen').click()

  const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'OBS-Overlay' }) })
  await section.getByRole('button', { name: 'Alles', exact: true }).click()
  await expect(section.getByText('Letzter Soul-Link').first()).toBeVisible()
  await section.getByRole('button', { name: 'Overlay-Link erstellen' }).click()

  // Angezeigt wird der Link ohne Schlüssel (könnte im Stream landen), kopiert wird er vollständig
  await expect(section.locator('code').first()).toHaveText(/#slo_•+$/)
  const copyLink = async () => {
    await section.getByRole('button', { name: 'Kopieren' }).click()
    return (await page.evaluate(() => navigator.clipboard.readText())).trim()
  }
  const url = await copyLink()
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

  // Nur zwei Spieler, nebeneinander, ohne Überschriften: andere Adresse, gleiches Token, gleiches Gerät
  await obs.goto(url.replace('w=stats,cap,link,team', 'w=team&p=0,1&dir=row&titles=0'))
  await expect(obs.getByText('Moritz').first()).toBeVisible()
  await expect(obs.getByText('Elsmann')).toHaveCount(0)
  await expect(obs.getByText('Team', { exact: true })).toHaveCount(0)

  // Wer den Link abschreibt (anderes Gerät), wird abgewiesen
  const viewerContext = await browser.newContext()
  const viewer = await viewerContext.newPage()
  await viewer.goto(url)
  await expect(viewer.getByText(/an ein anderes Gerät gebunden/)).toBeVisible()
  await expect(viewer.getByText('Lebende Links')).toHaveCount(0)

  // Gerät freigeben: das nächste Gerät wird gemerkt, das alte abgewiesen
  await page.reload()
  await tab(page, 'Einstellungen').click()
  const current = section.locator('li').filter({ hasText: 'Dieser Link' })
  await expect(current.getByText(/An ein Gerät gebunden seit/)).toBeVisible()
  await current.getByRole('button', { name: 'Gerät freigeben' }).click()
  await expect(page.getByText(/Gerät freigegeben/)).toBeVisible()
  await viewer.reload()
  await expect(viewer.getByText('Lebende Links')).toBeVisible()
  await obs.reload()
  await expect(obs.getByText(/an ein anderes Gerät gebunden/)).toBeVisible()

  // Erneuern: der alte Link ist sofort ungültig, der neue funktioniert
  await current.getByRole('button', { name: 'Erneuern' }).click()
  await expect(page.getByText(/Neuer Link erstellt/)).toBeVisible()
  await expect(viewer.getByText(/Overlay-Link ungültig oder widerrufen/)).toBeVisible({ timeout: 15_000 })
  const renewed = await copyLink()
  expect(renewed).not.toBe(url)
  await obs.goto(renewed)
  await expect(obs.getByText('Letzter Soul-Link')).toBeVisible()

  // Widerrufen: Das Overlay merkt es bei der nächsten Abfrage
  await current.getByRole('button', { name: 'Widerrufen' }).click()
  await expect(obs.getByText(/Overlay-Link ungültig oder widerrufen/)).toBeVisible({ timeout: 15_000 })

  expect(errors).toEqual([])
  expect(obsErrors).toEqual([])
  await obsContext.close()
  await viewerContext.close()
})

// Nicht nur die Leitung: Jeder Spieler erstellt eigene Overlay-Links
test('OBS-Overlay: Spieler erstellt einen eigenen Link', async ({ page }) => {
  const errors = watchErrors(page)
  await join(page, 'Janne', freshInviteHash('Janne'))
  await tab(page, 'Einstellungen').click()
  const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'OBS-Overlay' }) })
  await section.getByLabel('Bezeichnung').fill('Jannes Stream')
  await section.getByRole('button', { name: 'Overlay-Link erstellen' }).click()
  await expect(section.locator('code').first()).toHaveText(/#slo_•+$/)
  await expect(section.locator('li').filter({ hasText: 'Dieser Link' })).toContainText('Jannes Stream')
  expect(errors).toEqual([])
})
