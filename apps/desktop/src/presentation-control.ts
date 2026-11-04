// Serialized into one selected presentation frame. Never run on sign-in pages.
export function presentationFrame(input: { deckId: string; command?: { id: string; direction: 'next' | 'prev'; expiresAt: number } }) {
  const deckId = location.href.match(/^https:\/\/docs\.google\.com\/presentation\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]+)(?:\/|$)/)?.[1]
  // Current Slides renders page-wrapper/svgpage elements. Older viewers used
  // content/container. Keep both so a Google rollout does not pause a valid deck.
  const viewer = Array.from(document.querySelectorAll<HTMLElement>('.punch-viewer-page-wrapper, .punch-viewer-svgpage-svgcontainer, .punch-viewer-imagepage, .punch-viewer-content, .punch-viewer-container')).find(element => {
    const bounds = element.getBoundingClientRect()
    return bounds.width > 0 && bounds.height > 0 && getComputedStyle(element).visibility !== 'hidden'
  })
  const presenting = deckId === input.deckId && !!viewer
  const command = input.command
  if (!command) {
    const needsSignIn = !presenting && !!document.querySelector('a[href*="accounts.google.com"], iframe[src*="accounts.google.com"], form[action*="accounts.google.com"]')
    const needsAccess = !presenting && /you need access|request access|access denied/i.test(document.body?.innerText.slice(0, 2000) ?? '')
    return { presenting, title: document.title.replace(/ - Google Slides$/, ''), issue: needsAccess ? 'access' : needsSignIn ? 'sign-in' : document.readyState !== 'complete' ? 'loading' : 'viewer' }
  }
  if (!presenting) return { error: 'Open the selected deck in slideshow mode.' }
  if (command.direction !== 'next' && command.direction !== 'prev') return { error: 'Unsupported slide command.' }
  if (!Number.isFinite(command.expiresAt) || command.expiresAt < Date.now() || command.expiresAt > Date.now() + 5000) return { error: 'That click expired. Check the slide before trying again.' }
  const state = globalThis as typeof globalThis & { __nextslideClicks?: Map<string, number> }
  const seen = state.__nextslideClicks ??= new Map()
  for (const [id, expires] of seen) if (expires < Date.now() - 10000) seen.delete(id)
  if (seen.has(command.id)) return { ok: true }
  seen.set(command.id, command.expiresAt)
  const keyCode = command.direction === 'next' ? 39 : 37
  const key = command.direction === 'next' ? 'ArrowRight' : 'ArrowLeft'
  for (const type of ['keydown', 'keyup']) viewer!.dispatchEvent(new KeyboardEvent(type, { key, code: key, keyCode, which: keyCode, bubbles: true, cancelable: true, view: window }))
  return { ok: true }
}
