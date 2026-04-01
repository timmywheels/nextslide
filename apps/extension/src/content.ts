import type { SlideCommand } from '@nextslide/types'

type ContentMessage = { command: SlideCommand }

const KEY_MAP: Record<SlideCommand, { key: string; code: string; keyCode: number }> = {
  next:  { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  prev:  { key: 'ArrowLeft',  code: 'ArrowLeft',  keyCode: 37 },
  first: { key: 'Home',       code: 'Home',        keyCode: 36 },
  last:  { key: 'End',        code: 'End',         keyCode: 35 },
}

function fireKey(opts: { key: string; code: string; keyCode: number }): void {
  const props = { ...opts, which: opts.keyCode, bubbles: true, cancelable: true }

  // Try the active element first (where keyboard focus actually is),
  // then fall back to document. Google Slides listens at multiple levels
  // depending on the view (editor vs presentation).
  const targets: EventTarget[] = [
    document.activeElement ?? document.body,
    document.body,
    document,
  ]

  // Deduplicate — no point firing on the same target twice
  const seen = new Set<EventTarget>()
  for (const target of targets) {
    if (seen.has(target)) continue
    seen.add(target)
    target.dispatchEvent(new KeyboardEvent('keydown', props))
  }
}

chrome.runtime.onMessage.addListener((message: ContentMessage) => {
  const opts = KEY_MAP[message.command]
  if (opts) fireKey(opts)
})
