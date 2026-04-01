const DEFAULT_RELAY_URL = import.meta.env.VITE_RELAY_URL as string ?? 'wss://nextslide.app'

const input = document.getElementById('relay-url') as HTMLInputElement
const saveBtn = document.getElementById('save')!
const status = document.getElementById('status')!

// Load saved value
chrome.storage.sync.get(['relayUrl'], (result) => {
  input.value = (result.relayUrl as string | undefined) ?? ''
  input.placeholder = DEFAULT_RELAY_URL
})

saveBtn.addEventListener('click', () => {
  const val = input.value.trim()
  const relayUrl = val || DEFAULT_RELAY_URL
  chrome.storage.sync.set({ relayUrl }, () => {
    status.textContent = 'Saved!'
    setTimeout(() => { status.textContent = '' }, 2000)
  })
})
