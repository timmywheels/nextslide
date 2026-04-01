export type SlideCommand = 'next' | 'prev' | 'first' | 'last'

export type Participant = {
  id: string
  name: string
  role: 'presenter' | 'audience'
}

export type ClientMessage =
  | { type: 'join'; role: 'presenter' | 'audience'; name?: string; clientId?: string }
  | { type: 'command'; command: SlideCommand }
  | { type: 'pong' }

export type ServerMessage =
  | { type: 'joined'; participantCount: number; participants: Participant[] }
  | { type: 'participant_update'; count: number; participants: Participant[] }
  | { type: 'command'; command: SlideCommand }
  | { type: 'ping' }
  | { type: 'error'; message: 'no_presenter' | 'session_not_found' | 'presenter_already_connected' }

export type CreateSessionResponse = {
  code: string
  presenterUrl: string
  audienceUrl: string
}

export type SessionStatusResponse = {
  exists: boolean
  participantCount: number
  participants: Participant[]
}
