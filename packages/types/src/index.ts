export type SlideCommand = 'next' | 'prev' | 'first' | 'last'

export type Participant = {
  id: string
  name: string
  role: 'presenter' | 'speaker'
  enabled?: boolean  // speakers only; absent/undefined means enabled
}

export type ClientMessage =
  | { type: 'join'; role: 'presenter' | 'speaker'; name?: string; clientId?: string }
  | { type: 'command'; command: SlideCommand }
  | { type: 'pong' }
  | { type: 'speaker_status'; targetId: string; enabled: boolean }
  | { type: 'cue'; targetId: string; cueType: 'up' | 'warning' }
  | { type: 'timer_sync'; timerType: 'global'; action: 'start' | 'pause' | 'reset'; remainingMs: number }
  | { type: 'timer_sync'; timerType: 'speaker'; targetId: string; action: 'start' | 'pause' | 'reset'; remainingMs: number }

export type ServerMessage =
  | { type: 'joined'; participantCount: number; participants: Participant[] }
  | { type: 'participant_update'; count: number; participants: Participant[] }
  | { type: 'command'; command: SlideCommand }
  | { type: 'ping' }
  | { type: 'error'; message: 'no_presenter' | 'session_not_found' | 'presenter_already_connected' }
  | { type: 'your_status'; enabled: boolean }
  | { type: 'cue'; cueType: 'up' | 'warning' }
  | { type: 'timer_sync'; timerType: 'global' | 'speaker'; action: 'start' | 'pause' | 'reset'; remainingMs: number }

export type CreateSessionResponse = {
  code: string
  presenterUrl: string
  speakerUrl: string
}

export type SessionStatusResponse = {
  exists: boolean
  participantCount: number
  participants: Participant[]
}
