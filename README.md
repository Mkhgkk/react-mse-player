# React MSE Player

A strict, type-safe React component for streaming low-latency video using Media Source Extensions (MSE). Designed for seamless integration with [go2rtc](https://github.com/AlexxIT/go2rtc).

## Features

- **Media Source Extensions (MSE)**: Low-latency streaming directly in the browser.
- **Robust Connection Management**: Automatic reconnection handling with exponential backoff and stall detection.
- **Type-Safe**: Full TypeScript support with comprehensive type definitions.
- **Smart Buffering**: Internal buffer queueing and automatic memory trimming to prevent quota errors.
- **Broad Codec Support**: automatic negotiation for H.264, H.265 (HEVC), AAC, FLAC, and Opus.
- **ManagedMediaSource**: Support for iOS 17+ via ManagedMediaSource API.

## Installation

```bash
npm install react-mse-player
# or
yarn add react-mse-player
```

## Usage

### Basic Usage

```tsx
import React from 'react';
import { MSEVideoStream } from 'react-mse-player';

const Player = () => {
  return (
    <div style={{ width: '640px', aspectRatio: '16/9' }}>
      <MSEVideoStream 
        src="ws://localhost:1984/api/ws?src=camera1" 
      />
    </div>
  );
};
```

### Advanced Usage with TypeScript

```tsx
import React, { useCallback } from 'react';
import { MSEVideoStream } from 'react-mse-player';

const AdvancedPlayer = () => {
  const handleStatus = useCallback((status: string) => {
    // status: 'connecting' | 'open' | 'streaming' | 'closed' | 'error' | 'stalled' | 'reconnecting'
    console.log('[Player Status]', status);
  }, []);

  const handleError = useCallback((error: any) => {
    console.error('[Player Error]', error);
  }, []);

  return (
    <MSEVideoStream
      src="ws://localhost:1984/api/ws?src=camera1"
      autoPlay={true}
      controls={false}
      media="video,audio"
      onStatus={handleStatus}
      onError={handleError}
      className="custom-player-class"
      style={{ width: '100%', height: '100%' }}
    />
  );
};
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `src` | `string` | **Required** | WebSocket URL for the stream (e.g., `ws://...` or `/api/ws...`). |
| `width` | `string \| number` | `'100%'` | Width of the container. |
| `height` | `string \| number` | `'100%'` | Height of the container. |
| `autoPlay` | `boolean` | `true` | Whether to start playback automatically. |
| `controls` | `boolean` | `false` | Show native video controls. |
| `media` | `string` | `'video,audio'` | Media types to negotiate (`'video'`, `'audio'`, or `'video,audio'`). |
| `onStatus` | `(status: string) => void` | `undefined` | Callback for connection status updates. |
| `onError` | `(error: any) => void` | `undefined` | Callback for errors. |
| `className` | `string` | `''` | CSS class for the container. |
| `style` | `React.CSSProperties` | `{}` | Inline styles for the container. |

## Browser Support

- **Chromium-based** (Chrome, Edge, Brave): Full support.
- **Firefox**: Full support.
- **Safari**: Supported on version 17+ via `ManagedMediaSource`.
- **Mobile**: Supported on Android (Chrome/Firefox) and iOS 17.1+ (Safari).

## License

MIT
