import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import WebRTCVideoStream from '../WebRTCVideoStream'

// --- Mocks ---

class MockRTCPeerConnection {
  static instances: MockRTCPeerConnection[] = []

  connectionState = 'new'
  private handlers: Map<string, EventListener[]> = new Map()

  addEventListener = vi.fn((event: string, handler: EventListener) => {
    const existing = this.handlers.get(event) ?? []
    this.handlers.set(event, [...existing, handler])
  })
  removeEventListener = vi.fn()
  getSenders = vi.fn().mockReturnValue([])
  getTransceivers = vi.fn().mockReturnValue([])
  addTransceiver = vi.fn()
  createOffer = vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-offer-sdp' })
  setLocalDescription = vi.fn().mockResolvedValue(undefined)
  setRemoteDescription = vi.fn().mockResolvedValue(undefined)
  addIceCandidate = vi.fn().mockResolvedValue(undefined)
  close = vi.fn()

  constructor(_config?: RTCConfiguration) {
    MockRTCPeerConnection.instances.push(this)
  }

  triggerConnectionStateChange(state: string) {
    this.connectionState = state
    const handlers = this.handlers.get('connectionstatechange') ?? []
    handlers.forEach((h) => h(new Event('connectionstatechange')))
  }

  triggerIceCandidate(candidate: RTCIceCandidate | null) {
    const handlers = this.handlers.get('icecandidate') ?? []
    handlers.forEach((h) =>
      h(new RTCPeerConnectionIceEvent('icecandidate', { candidate }))
    )
  }
}

class MockWebSocket {
  static instances: MockWebSocket[] = []

  binaryType = ''
  onopen: ((e: Event) => void) | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  onclose: ((e: CloseEvent) => void) | null = null
  onerror: ((e: Event) => void) | null = null
  send = vi.fn()
  close = vi.fn()

  constructor(public url: string) {
    MockWebSocket.instances.push(this)
  }
}

// --- Test suite ---

describe('WebRTCVideoStream', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    MockRTCPeerConnection.instances = []

    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubGlobal('RTCPeerConnection', MockRTCPeerConnection)

    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders a video element', () => {
    render(<WebRTCVideoStream src="ws://localhost/stream" />)
    expect(document.querySelector('video')).not.toBeNull()
  })

  it('creates a WebSocket with the provided src', () => {
    render(<WebRTCVideoStream src="ws://localhost/stream" />)
    expect(MockWebSocket.instances[0]?.url).toBe('ws://localhost/stream')
  })

  it('converts http:// src to ws://', () => {
    render(<WebRTCVideoStream src="http://localhost/stream" />)
    expect(MockWebSocket.instances[0]?.url).toBe('ws://localhost/stream')
  })

  it('converts https:// src to wss://', () => {
    render(<WebRTCVideoStream src="https://example.com/stream" />)
    expect(MockWebSocket.instances[0]?.url).toBe('wss://example.com/stream')
  })

  it('calls onStatus with "connecting" on mount', () => {
    const onStatus = vi.fn()
    render(<WebRTCVideoStream src="ws://localhost/stream" onStatus={onStatus} />)
    expect(onStatus).toHaveBeenCalledWith('connecting')
  })

  it('calls onStatus with "open" when WebSocket connects', () => {
    const onStatus = vi.fn()
    render(<WebRTCVideoStream src="ws://localhost/stream" onStatus={onStatus} />)
    const ws = MockWebSocket.instances[0]!
    act(() => ws.onopen?.(new Event('open')))
    expect(onStatus).toHaveBeenCalledWith('open')
  })

  it('creates RTCPeerConnection on WebSocket open', () => {
    render(<WebRTCVideoStream src="ws://localhost/stream" />)
    const ws = MockWebSocket.instances[0]!
    act(() => ws.onopen?.(new Event('open')))
    expect(MockRTCPeerConnection.instances).toHaveLength(1)
  })

  it('sends webrtc/offer after peer connection is set up', async () => {
    render(<WebRTCVideoStream src="ws://localhost/stream" />)
    const ws = MockWebSocket.instances[0]!
    await act(async () => ws.onopen?.(new Event('open')))
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'webrtc/offer', value: 'mock-offer-sdp' })
    )
  })

  it('handles webrtc/answer from server', async () => {
    render(<WebRTCVideoStream src="ws://localhost/stream" />)
    const ws = MockWebSocket.instances[0]!
    await act(async () => ws.onopen?.(new Event('open')))
    const pc = MockRTCPeerConnection.instances[0]!
    await act(async () =>
      ws.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'webrtc/answer', value: 'answer-sdp' }),
        })
      )
    )
    expect(pc.setRemoteDescription).toHaveBeenCalledWith({
      type: 'answer',
      sdp: 'answer-sdp',
    })
  })

  it('calls onError with "Connection failed" on WebSocket error', () => {
    const onError = vi.fn()
    render(<WebRTCVideoStream src="ws://localhost/stream" onError={onError} />)
    const ws = MockWebSocket.instances[0]!
    act(() => ws.onerror?.(new Event('error')))
    expect(onError).toHaveBeenCalledWith('Connection failed')
  })

  it('closes WebSocket and RTCPeerConnection on unmount', async () => {
    const { unmount } = render(<WebRTCVideoStream src="ws://localhost/stream" />)
    const ws = MockWebSocket.instances[0]!
    await act(async () => ws.onopen?.(new Event('open')))
    const pc = MockRTCPeerConnection.instances[0]!
    unmount()
    expect(pc.close).toHaveBeenCalled()
    expect(ws.close).toHaveBeenCalled()
  })

  it('calls onStatus with "reconnecting" on WebSocket close before PC connects', () => {
    const onStatus = vi.fn()
    render(<WebRTCVideoStream src="ws://localhost/stream" onStatus={onStatus} />)
    const ws = MockWebSocket.instances[0]!
    act(() => ws.onclose?.(new CloseEvent('close')))
    expect(onStatus).toHaveBeenCalledWith('reconnecting')
  })

  it('creates a new WebSocket when src prop changes', () => {
    const { rerender } = render(<WebRTCVideoStream src="ws://localhost/stream1" />)
    expect(MockWebSocket.instances).toHaveLength(1)
    rerender(<WebRTCVideoStream src="ws://localhost/stream2" />)
    expect(MockWebSocket.instances).toHaveLength(2)
    expect(MockWebSocket.instances[1]?.url).toBe('ws://localhost/stream2')
  })

  it('handles webrtc/candidate from server', async () => {
    render(<WebRTCVideoStream src="ws://localhost/stream" />)
    const ws = MockWebSocket.instances[0]!
    await act(async () => ws.onopen?.(new Event('open')))
    const pc = MockRTCPeerConnection.instances[0]!
    await act(async () =>
      ws.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'webrtc/candidate', value: 'candidate-data' }),
        })
      )
    )
    expect(pc.addIceCandidate).toHaveBeenCalledWith({
      candidate: 'candidate-data',
      sdpMid: '0',
    })
  })

  it('filters out UDP candidates in webrtc/tcp mode', async () => {
    render(<WebRTCVideoStream src="ws://localhost/stream" mode="webrtc/tcp" />)
    const ws = MockWebSocket.instances[0]!
    await act(async () => ws.onopen?.(new Event('open')))
    const pc = MockRTCPeerConnection.instances[0]!
    await act(async () =>
      ws.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'webrtc/candidate',
            value: 'candidate:0 1 udp 1234 192.168.1.1 5000 typ host',
          }),
        })
      )
    )
    expect(pc.addIceCandidate).not.toHaveBeenCalled()
  })
})
