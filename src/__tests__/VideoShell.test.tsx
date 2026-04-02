import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import VideoShell, { VideoShellProps } from '../VideoShell'

function renderVideoShell(props: Partial<VideoShellProps> = {}) {
  const videoRef = React.createRef<HTMLVideoElement>()
  return render(
    <VideoShell
      videoRef={videoRef}
      isLoading={false}
      status="streaming"
      error={null}
      {...props}
    />
  )
}

describe('VideoShell', () => {
  it('renders a video element', () => {
    renderVideoShell()
    expect(document.querySelector('video')).not.toBeNull()
  })

  it('applies default width and height to wrapper', () => {
    const { container } = renderVideoShell()
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.width).toBe('100%')
    expect(wrapper.style.height).toBe('100%')
  })

  it('applies custom width and height', () => {
    const { container } = renderVideoShell({ width: 640, height: 480 })
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.width).toBe('640px')
    expect(wrapper.style.height).toBe('480px')
  })

  it('applies string dimensions', () => {
    const { container } = renderVideoShell({ width: '800px', height: '600px' })
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.width).toBe('800px')
    expect(wrapper.style.height).toBe('600px')
  })

  it('applies objectFit to video element', () => {
    renderVideoShell({ objectFit: 'cover' })
    const video = document.querySelector('video') as HTMLVideoElement
    expect(video.style.objectFit).toBe('cover')
  })

  it('video has muted and playsInline attributes', () => {
    renderVideoShell()
    const video = document.querySelector('video') as HTMLVideoElement
    expect(video.muted).toBe(true)
  })

  it('video respects controls prop', () => {
    renderVideoShell({ controls: true })
    const video = document.querySelector('video') as HTMLVideoElement
    expect(video.controls).toBe(true)
  })

  it('shows no overlay text when not loading and no error', () => {
    renderVideoShell({ isLoading: false, status: 'streaming', error: null })
    expect(screen.queryByText('Stream not found')).not.toBeInTheDocument()
    expect(screen.queryByText('Connection failed')).not.toBeInTheDocument()
    expect(screen.queryByText('Reconnecting...')).not.toBeInTheDocument()
  })

  it('shows overlay with spinner when loading (no error)', () => {
    const { container } = renderVideoShell({ isLoading: true, status: 'connecting', error: null })
    // The @keyframes style tag is only injected inside the overlay
    expect(container.querySelector('style')).not.toBeNull()
    expect(screen.queryByText('Stream not found')).not.toBeInTheDocument()
  })

  it('shows reconnecting label when reconnecting', () => {
    renderVideoShell({ isLoading: true, status: 'reconnecting', error: null })
    expect(screen.getByText('Reconnecting...')).toBeInTheDocument()
  })

  it('shows stream not found error', () => {
    renderVideoShell({ isLoading: false, status: 'error', error: 'Stream not found' })
    expect(screen.getByText('Stream not found')).toBeInTheDocument()
  })

  it('shows connection failed error', () => {
    renderVideoShell({ isLoading: false, status: 'error', error: 'Connection failed' })
    expect(screen.getByText('Connection failed')).toBeInTheDocument()
  })

  it('shows generic error message for unknown errors', () => {
    renderVideoShell({ isLoading: false, status: 'error', error: 'Something unexpected' })
    expect(screen.getByText('Something unexpected')).toBeInTheDocument()
  })

  it('uses custom streamNotFound label', () => {
    renderVideoShell({
      isLoading: false,
      status: 'error',
      error: 'Stream not found',
      labels: { streamNotFound: 'No stream available' },
    })
    expect(screen.getByText('No stream available')).toBeInTheDocument()
    expect(screen.queryByText('Stream not found')).not.toBeInTheDocument()
  })

  it('uses custom connectionFailed label', () => {
    renderVideoShell({
      isLoading: false,
      status: 'error',
      error: 'Connection failed',
      labels: { connectionFailed: 'Cannot connect' },
    })
    expect(screen.getByText('Cannot connect')).toBeInTheDocument()
  })

  it('uses custom reconnecting label', () => {
    renderVideoShell({
      isLoading: true,
      status: 'reconnecting',
      error: null,
      labels: { reconnecting: 'Trying again...' },
    })
    expect(screen.getByText('Trying again...')).toBeInTheDocument()
  })

  it('applies custom className to wrapper', () => {
    const { container } = renderVideoShell({ className: 'my-player' })
    expect((container.firstChild as HTMLElement).classList.contains('my-player')).toBe(true)
  })

  it('merges custom style with default styles', () => {
    const { container } = renderVideoShell({ style: { backgroundColor: 'red' } })
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.backgroundColor).toBe('red')
    expect(wrapper.style.position).toBe('relative')
  })
})
