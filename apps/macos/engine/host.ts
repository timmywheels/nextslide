import { HostSession } from '../../desktop/src/host-session'
import type { NativeStatus } from '../../desktop/src/types'

declare global { interface Window { nextslideNative(value: string): void; nextslideHost: typeof bridge } }
let host: HostSession | undefined
const pending = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
const post = (value: object) => window.nextslideNative(JSON.stringify(value))
const bridge = {
  async start(options: { service: string; inviteOrigin: string; createToken: string }) {
    await bridge.stop()
    host = new HostSession(options.service, command => new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(command.id); reject(new Error('Command not confirmed. Check the slide before trying again.')) }, 2000)
      pending.set(command.id, { resolve, reject, timer })
      post({ type: 'command', command })
    }), snapshot => post({ type: 'snapshot', snapshot }), () => post({ type: 'ended' }), options.inviteOrigin, options.createToken)
    await host.start()
  },
  async stop() { const old = host; host = undefined; await old?.stop(); for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error('Session ended.')) }; pending.clear() },
  status(status: NativeStatus) { host?.updateStatus(status) },
  allow(id: string, enabled: boolean) { host?.enable(id, enabled) },
  pause() { host?.pauseAll() },
  complete(id: string, error?: string) { const task = pending.get(id); if (!task) return; pending.delete(id); clearTimeout(task.timer); error ? task.reject(new Error(error)) : task.resolve() },
}
window.nextslideHost = bridge
post({ type: 'engine-ready' })
