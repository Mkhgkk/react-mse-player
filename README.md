# React MSE Player

A React component for streaming video using Media Source Extensions (MSE), specifically designed for [go2rtc](https://github.com/AlexxIT/go2rtc).

## Features

- 🎥 MSE (Media Source Extensions) video streaming
- 🔄 Automatic reconnection on connection loss
- 📱 Mobile support with playsInline
- 🎨 Customizable styling
- 🔊 Audio + Video support
- 🍎 Safari support (including ManagedMediaSource for Safari 17+)
- ⚡ Low latency live streaming
- 🎯 Simple API

## Installation

```bash
npm install react-mse-player
```

or

```bash
yarn add react-mse-player
```

## Usage

### Basic Example

```jsx
import React from 'react';
import { MSEVideoStream } from 'react-mse-player';

function App() {
  return (
    <div>
      <MSEVideoStream
        src="/api/ws?src=camera1"
        width="640px"
        height="480px"
      />
    </div>
  );
}

export default App;
```

### Advanced Example

```jsx
import React from 'react';
import { MSEVideoStream } from 'react-mse-player';

function App() {
  const handleStatus = (status) => {
    console.log('Stream status:', status);
  };

  const handleError = (error) => {
    console.error('Stream error:', error);
  };

  return (
    <div>
      <MSEVideoStream
        src="ws://localhost:1984/api/ws?src=mycamera"
        width="100%"
        height="auto"
        controls={true}
        autoPlay={true}
        media="video,audio"
        onStatus={handleStatus}
        onError={handleError}
        showStatusOverlay={true}
        className="my-video-player"
        style={{ maxWidth: '1280px' }}
      />
    </div>
  );
}

export default App;
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `src` | `string` | **required** | WebSocket URL for the stream (e.g., `/api/ws?src=camera1` or `ws://localhost:1984/api/ws?src=camera1`) |
| `width` | `string` | `'100%'` | Video width (any valid CSS width value) |
| `height` | `string` | `'100%'` | Video height (any valid CSS height value) |
| `controls` | `boolean` | `true` | Show video controls |
| `autoPlay` | `boolean` | `true` | Auto-play video when ready |
| `media` | `string` | `'video,audio'` | Media types to request: `'video'`, `'audio'`, or `'video,audio'` |
| `onStatus` | `function` | `undefined` | Callback function called when status changes. Receives status string: `'connecting'`, `'open'`, `'streaming'`, `'closed'`, or `'error'` |
| `onError` | `function` | `undefined` | Callback function called when an error occurs. Receives error message string |
| `className` | `string` | `''` | Additional CSS class name for the container div |
| `style` | `object` | `{}` | Additional inline styles for the container div |
| `showStatusOverlay` | `boolean` | `true` | Show status overlay in top-right corner |

## Status Values

The component emits the following status values through the `onStatus` callback:

- `connecting` - Initial connection to WebSocket
- `open` - WebSocket connected, setting up MSE
- `streaming` - Video is streaming
- `closed` - Connection closed (will auto-reconnect)
- `error` - An error occurred

## Browser Support

- ✅ Chrome/Edge (Desktop & Mobile)
- ✅ Firefox (Desktop & Mobile)
- ✅ Safari 17+ (with ManagedMediaSource)
- ✅ Safari 11-16 (limited codec support)
- ✅ Opera
- ✅ Samsung Internet

## Supported Codecs

The component automatically detects and uses the best available codecs:

**Video:**
- H.264 (avc1)
- H.265 (hvc1) - where supported

**Audio:**
- AAC LC
- AAC HE
- FLAC
- Opus

## go2rtc Integration

This component is designed to work seamlessly with [go2rtc](https://github.com/AlexxIT/go2rtc). Make sure your go2rtc server is running and accessible.

Example go2rtc configuration:

```yaml
streams:
  camera1: rtsp://username:password@camera-ip:554/stream

api:
  listen: ":1984"
```

Then use the component:

```jsx
<MSEVideoStream src="/api/ws?src=camera1" />
```

## Development

### Build

```bash
npm run build
```

### Watch mode

```bash
npm run dev
```

## License

MIT

## Credits

Based on the [go2rtc](https://github.com/AlexxIT/go2rtc) VideoRTC player by [@AlexxIT](https://github.com/AlexxIT).
