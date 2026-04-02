import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import MSEVideoStream from '../MSEVideoStream'

// --- Mocks ---

class MockSourceBuffer {
  updating = false
  buffered = { length: 0, start: vi.fn().mockReturnValue(0), end: vi.fn().mockReturnValue(0) }
  mode = ''
  addEventListener = vi.fn()
  removeEventListener = vi.fn()
  appendBuffer = vi.fn()
  remove = vi.fn()
}

class MockMediaSource {
  static instances: MockMediaSource[] = []
  static isTypeSupported = vi.fn().mockReturnValue(true)

  readyState: string = 'closed'
  sourceBuffers: { length: number } = { length: 0 }
  private handlers: Record<string, Function> = {}

  addEventListener(event: string, handler: Function) {
    this.handlers[event] = handler
  }
  removeEventListener = vi.fn()
  addSourceBuffer = vi.fn(() => new MockSourceBuffer())
  removeSourceBuffer = vi.fn()
  setLiveSeekableRange = vi.fn()

  constructor() {
    MockMediaSource.instances.push(this)
  }

  triggerSourceOpen() {
    this.readyState = 'open'
    this.handlers['sourceopen']?.()
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

describe('MSEVideoStream', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    MockMediaSource.instances = []

    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubGlobal('MediaSource', MockMediaSource)

    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/mock')
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined as unknown as void)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders a video element', () => {
    render(<MSEVideoStream src="ws://localhost/stream" />)
    expect(document.querySelector('video')).not.toBeNull()
  })

  it('creates a WebSocket with the provided src', () => {
    render(<MSEVideoStream src="ws://localhost/stream" />)
    expect(MockWebSocket.instances[0]?.url).toBe('ws://localhost/stream')
  })

  it('converts http:// src to ws://', () => {
    render(<MSEVideoStream src="http://localhost/stream" />)
    expect(MockWebSocket.instances[0]?.url).toBe('ws://localhost/stream')
  })

  it('converts https:// src to wss://', () => {
    render(<MSEVideoStream src="https://example.com/stream" />)
    expect(MockWebSocket.instances[0]?.url).toBe('wss://example.com/stream')
  })

  it('calls onStatus with "connecting" on mount', () => {
    const onStatus = vi.fn()
    render(<MSEVideoStream src="ws://localhost/stream" onStatus={onStatus} />)
    expect(onStatus).toHaveBeenCalledWith('connecting')
  })

  it('closes WebSocket on unmount', () => {
    const { unmount } = render(<MSEVideoStream src="ws://localhost/stream" />)
    const ws = MockWebSocket.instances[0]!
    unmount()
    expect(ws.close).toHaveBeenCalled()
  })

  it('calls onError with "Connection failed" on WebSocket error', () => {
    const onError = vi.fn()
    render(<MSEVideoStream src="ws://localhost/stream" onError={onError} />)
    const ws = MockWebSocket.instances[0]!
    act(() => ws.onerror?.(new Event('error')))
    expect(onError).toHaveBeenCalledWith('Connection failed')
  })

  it('calls onStatus with "reconnecting" on WebSocket close', () => {
    const onStatus = vi.fn()
    render(<MSEVideoStream src="ws://localhost/stream" onStatus={onStatus} />)
    const ws = MockWebSocket.instances[0]!
    act(() => ws.onclose?.(new CloseEvent('close')))
    expect(onStatus).toHaveBeenCalledWith('reconnecting')
  })

  it('calls onStatus with "open" when WebSocket opens', () => {
    const onStatus = vi.fn()
    render(<MSEVideoStream src="ws://localhost/stream" onStatus={onStatus} />)
    const ws = MockWebSocket.instances[0]!
    act(() => ws.onopen?.(new Event('open')))
    expect(onStatus).toHaveBeenCalledWith('open')
  })

  it('creates MediaSource and sets video src on WebSocket open', () => {
    render(<MSEVideoStream src="ws://localhost/stream" />)
    const ws = MockWebSocket.instances[0]!
    act(() => ws.onopen?.(new Event('open')))
    expect(MockMediaSource.instances).toHaveLength(1)
  })

  it('sends supported codecs to server after sourceopen', () => {
    render(<MSEVideoStream src="ws://localhost/stream" />)
    const ws = MockWebSocket.instances[0]!
    act(() => ws.onopen?.(new Event('open')))
    const ms = MockMediaSource.instances[0]!
    act(() => ms.triggerSourceOpen())
    expect(ws.send).toHaveBeenCalledWith(
      expect.stringContaining('"type":"mse"')
    )
  })

  it('calls onStatus with "reconnecting" on server error message', () => {
    const onStatus = vi.fn()
    render(<MSEVideoStream src="ws://localhost/stream" onStatus={onStatus} />)
    const ws = MockWebSocket.instances[0]!
    act(() => ws.onopen?.(new Event('open')))
    act(() =>
      ws.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'error', value: 'some server error' }),
        })
      )
    )
    expect(onStatus).toHaveBeenCalledWith('reconnecting')
  })

  it('reconnects with a new WebSocket after close delay', async () => {
    vi.useFakeTimers()
    try {
      render(<MSEVideoStream src="ws://localhost/stream" />)
      const ws = MockWebSocket.instances[0]!
      act(() => ws.onclose?.(new CloseEvent('close')))
      expect(MockWebSocket.instances).toHaveLength(1)

      await act(async () => {
        vi.advanceTimersByTime(2100)
      })

      expect(MockWebSocket.instances).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('creates a new WebSocket when src prop changes', () => {
    const { rerender } = render(<MSEVideoStream src="ws://localhost/stream1" />)
    expect(MockWebSocket.instances).toHaveLength(1)
    rerender(<MSEVideoStream src="ws://localhost/stream2" />)
    expect(MockWebSocket.instances).toHaveLength(2)
    expect(MockWebSocket.instances[1]?.url).toBe('ws://localhost/stream2')
  })

  it('shows error state when MediaSource is not supported', () => {
    vi.unstubAllGlobals()
    vi.stubGlobal('WebSocket', MockWebSocket)
    // No MediaSource global

    const onStatus = vi.fn()
    const onError = vi.fn()
    render(
      <MSEVideoStream
        src="ws://localhost/stream"
        onStatus={onStatus}
        onError={onError}
      />
    )
    const ws = MockWebSocket.instances[0]!
    act(() => ws.onopen?.(new Event('open')))

    expect(onError).toHaveBeenCalledWith('MediaSource not supported')
    expect(onStatus).toHaveBeenCalledWith('error')
  })
})
