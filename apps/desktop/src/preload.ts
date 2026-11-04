import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopAPI } from './types'
const api: DesktopAPI = {
  config: () => ipcRenderer.invoke('config'),
  saveService: value => ipcRenderer.invoke('save-service', value),
  apps: () => ipcRenderer.invoke('apps'),
  selectApp: app => ipcRenderer.invoke('select-app', app),
  status: () => ipcRenderer.invoke('status'),
  requestAccess: () => ipcRenderer.invoke('request-access'),
  revealApp: () => ipcRenderer.invoke('reveal-app'),
  showPresentation: () => ipcRenderer.invoke('show-presentation'),
  openDeck: url => ipcRenderer.invoke('open-deck', url),
  startHosting: () => ipcRenderer.invoke('start-hosting'),
  stopHosting: () => ipcRenderer.invoke('stop-hosting'),
  active: value => ipcRenderer.invoke('active', value),
  dispatch: command => ipcRenderer.invoke('dispatch', command),
  copy: value => ipcRenderer.invoke('copy', value),
  hide: () => ipcRenderer.invoke('hide'),
  quit: () => ipcRenderer.invoke('quit'),
}
contextBridge.exposeInMainWorld('nextslide', api)
ipcRenderer.on('locked', () => window.dispatchEvent(new Event('nextslide-locked')))
ipcRenderer.on('shutdown', () => window.dispatchEvent(new Event('nextslide-shutdown')))
ipcRenderer.on('refresh-status', () => window.dispatchEvent(new Event('nextslide-refresh')))
ipcRenderer.on('hosting-error', (_event, message: string) => window.dispatchEvent(new CustomEvent('nextslide-hosting-error', { detail: message })))
