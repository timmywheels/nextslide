import { test, expect } from '@playwright/test'
import { presentationFrame } from '../apps/desktop/src/presentation-control'

test('a targeted slideshow receives one click while another tab is active; stale clicks never replay', async ({ page, context }) => {
  await page.route('https://docs.google.com/presentation/d/fixture/present', route => route.fulfill({ contentType: 'text/html', body: '<div class="punch-viewer-content" style="width:800px;height:500px">Slide <span id="slide">1</span></div>' }))
  await page.goto('https://docs.google.com/presentation/d/fixture/present')
  await page.evaluate(() => {
    document.addEventListener('keydown', event => {
      if (event.key === 'ArrowRight') document.querySelector('#slide')!.textContent = String(Number(document.querySelector('#slide')!.textContent) + 1)
    })
  })
  const other = await context.newPage()
  await other.setContent('<input aria-label="Other work" value="Keep typing here">')
  await other.getByRole('textbox').focus()
  const command = { id: 'one-click', direction: 'next' as const, expiresAt: Date.now() + 1000 }
  expect(await page.evaluate(presentationFrame, { deckId: 'fixture', command })).toEqual({ ok: true })
  expect(await page.evaluate(presentationFrame, { deckId: 'fixture', command })).toEqual({ ok: true })
  await expect(page.locator('#slide')).toHaveText('2')
  await expect(other.getByRole('textbox')).toBeFocused()
  await expect(other.getByRole('textbox')).toHaveValue('Keep typing here')
  expect((await page.evaluate(presentationFrame, { deckId: 'fixture', command: { ...command, id: 'expired', expiresAt: Date.now() - 1 } })).error).toContain('expired')
  await expect(page.locator('#slide')).toHaveText('2')
  await page.setContent('<textarea>Editor content</textarea>')
  expect((await page.evaluate(presentationFrame, { deckId: 'fixture', command: { ...command, id: 'editor' } })).error).toContain('slideshow mode')
})
