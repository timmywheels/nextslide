import type { Command } from '@nextslide/connection'

export type PresentationApp = { pid: number; name: string; bundleId: string; tabKey?: string; ready?: boolean }
export type NativeStatus = { trusted: boolean; running: boolean; frontmost: boolean; requiresFocus?: boolean; message?: string; remoteMessage?: string }
export type DesktopAPI = {
  config(): Promise<{ service: string }>
  saveService(value: string): Promise<void>
  apps(): Promise<PresentationApp[]>
  selectApp(app: PresentationApp | null): Promise<void>
  status(): Promise<NativeStatus>
  requestAccess(): Promise<void>
  revealApp(): Promise<void>
  showPresentation(): Promise<void>
  openDeck(url: string): Promise<PresentationApp>
  startHosting(): Promise<{ service: string; inviteOrigin: string; createToken?: string }>
  stopHosting(): Promise<void>
  active(value: boolean): Promise<void>
  dispatch(command: Command): Promise<void>
  copy(value: string): Promise<void>
  hide(): Promise<void>
  quit(): Promise<void>
}
declare global { interface Window { nextslide: DesktopAPI } }
