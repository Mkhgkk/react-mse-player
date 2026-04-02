import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { toWsUrl, useVideoPlayer } from '../useVideoPlayer'

describe('toWsUrl', () => {
  it('converts http:// to ws://', () => {
    expect(toWsUrl('http://example.com/stream')).toBe('ws://example.com/stream')
  })

  it('converts https:// to wss://', () => {
    expect(toWsUrl('https://example.com/stream')).toBe('wss://example.com/stream')
  })

  it('passes through ws:// unchanged', () => {
    expect(toWsUrl('ws://example.com/stream')).toBe('ws://example.com/stream')
  })

  it('passes through wss:// unchanged', () => {
    expect(toWsUrl('wss://example.com/stream')).toBe('wss://example.com/stream')
  })

  it('converts relative path using window.location.origin', () => {
    // jsdom URL is configured to http://localhost/
    expect(toWsUrl('/stream')).toBe('ws://localhost/stream')
  })
})

describe('useVideoPlayer', () => {
  it('initializes with default state', () => {
    const { result } = renderHook(() => useVideoPlayer(undefined, undefined))
    expect(result.current.status).toBe('connecting')
    expect(result.current.error).toBeNull()
    expect(result.current.isPlaying).toBe(false)
  })

  it('updateStatus updates state and calls callback', () => {
    const onStatus = vi.fn()
    const { result } = renderHook(() => useVideoPlayer(onStatus, undefined))
    act(() => result.current.updateStatus('streaming'))
    expect(result.current.status).toBe('streaming')
    expect(onStatus).toHaveBeenCalledWith('streaming')
  })

  it('updateError updates state and calls callback', () => {
    const onError = vi.fn()
    const { result } = renderHook(() => useVideoPlayer(undefined, onError))
    act(() => result.current.updateError('something went wrong'))
    expect(result.current.error).toBe('something went wrong')
    expect(onError).toHaveBeenCalledWith('something went wrong')
  })

  it('setIsPlaying updates isPlaying', () => {
    const { result } = renderHook(() => useVideoPlayer(undefined, undefined))
    act(() => result.current.setIsPlaying(true))
    expect(result.current.isPlaying).toBe(true)
  })

  it('does not throw when callbacks are undefined', () => {
    const { result } = renderHook(() => useVideoPlayer(undefined, undefined))
    expect(() => {
      act(() => result.current.updateStatus('streaming'))
      act(() => result.current.updateError('error'))
    }).not.toThrow()
  })

  it('uses latest callback ref to avoid stale closures', () => {
    const onStatus1 = vi.fn()
    const onStatus2 = vi.fn()
    const { result, rerender } = renderHook(
      ({ onStatus }) => useVideoPlayer(onStatus, undefined),
      { initialProps: { onStatus: onStatus1 } }
    )
    rerender({ onStatus: onStatus2 })
    act(() => result.current.updateStatus('streaming'))
    expect(onStatus1).not.toHaveBeenCalled()
    expect(onStatus2).toHaveBeenCalledWith('streaming')
  })

  it('updateError clears error when passed null', () => {
    const { result } = renderHook(() => useVideoPlayer(undefined, undefined))
    act(() => result.current.updateError('an error'))
    act(() => result.current.updateError(null))
    expect(result.current.error).toBeNull()
  })
})
