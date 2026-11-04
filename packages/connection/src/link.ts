import type { Packet, Signal } from './protocol.js'

// Both ends keep the authenticated relay available while ICE finds a direct path.
// Reliable, ordered messages expire rather than delivering old clicks after a stall.
export class PeerLink {
  private pc?: RTCPeerConnection
  private channel?: RTCDataChannel
  private candidates: RTCIceCandidateInit[] = []
  private closed = false
  private signaling = Promise.resolve()

  constructor(
    initiator: boolean,
    private signal: (data: Signal) => void,
    private relay: (data: Packet) => boolean,
    private receive: (data: unknown) => void,
    private change: (direct: boolean) => void,
    iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }],
  ) {
    let pc: RTCPeerConnection
    try { pc = new RTCPeerConnection({ iceServers }) }
    catch { return } // Enterprise policies may disable WebRTC entirely.
    this.pc = pc
    pc.onicecandidate = event => { if (event.candidate) this.signal({ candidate: event.candidate.toJSON() }) }
    pc.ondatachannel = event => this.attach(event.channel)
    pc.onconnectionstatechange = () => this.change(this.direct)
    if (initiator) {
      this.attach(pc.createDataChannel('slides', { ordered: true, maxPacketLifeTime: 1000 }))
      this.signaling = pc.createOffer().then(async offer => {
        if (this.closed) return
        await pc.setLocalDescription(offer)
        if (this.closed) return
        this.signal({ description: { type: offer.type, sdp: offer.sdp } })
      }).catch(() => this.change(false))
    }
  }

  private attach(channel: RTCDataChannel): void {
    this.channel = channel
    channel.onopen = () => this.change(true)
    channel.onclose = () => this.change(false)
    channel.onerror = () => this.change(false)
    channel.onmessage = event => {
      if (this.closed) return
      if (typeof event.data !== 'string' || event.data.length > 4096) return
      try { this.receive(JSON.parse(event.data)) } catch { /* Ignore malformed packets. */ }
    }
  }

  get direct(): boolean { return this.channel?.readyState === 'open' && this.pc?.connectionState === 'connected' }

  accept(data: Signal): void {
    this.signaling = this.signaling.then(async () => {
      const pc = this.pc
      if (this.closed || !pc) return
      if (data.description) {
        await pc.setRemoteDescription(data.description)
        for (const candidate of this.candidates.splice(0)) await pc.addIceCandidate(candidate)
        if (data.description.type === 'offer') {
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          this.signal({ description: { type: answer.type, sdp: answer.sdp } })
        }
      } else if (data.candidate) {
        if (pc.remoteDescription) await pc.addIceCandidate(data.candidate)
        else if (this.candidates.length < 64) this.candidates.push(data.candidate)
      }
    }).catch(() => this.change(false))
  }

  send(data: Packet): boolean {
    if (this.closed) return false
    if (this.direct && this.channel && this.channel.bufferedAmount < 4096) {
      try { this.channel.send(JSON.stringify(data)); return true } catch { /* Use relay. */ }
    }
    return this.relay(data)
  }

  close(): void {
    this.closed = true
    if (this.channel) {
      this.channel.onmessage = null
      this.channel.onopen = null
      this.channel.onclose = null
      this.channel.onerror = null
    }
    if (this.pc) {
      this.pc.onicecandidate = null
      this.pc.ondatachannel = null
      this.pc.onconnectionstatechange = null
    }
    this.channel?.close()
    this.pc?.close()
  }
}
