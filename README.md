# React MSE Player

[![CI](https://github.com/Mkhgkk/react-mse-player/actions/workflows/ci.yml/badge.svg)](https://github.com/Mkhgkk/react-mse-player/actions/workflows/ci.yml) [![NPM Version](https://img.shields.io/npm/v/react-mse-player)](https://www.npmjs.com/package/react-mse-player) [![NPM Downloads](https://img.shields.io/npm/dm/react-mse-player)](https://www.npmjs.com/package/react-mse-player) [![License](https://img.shields.io/npm/l/react-mse-player)](https://github.com/Mkhgkk/react-mse-player)

React components for low-latency video streaming via **MSE** and **WebRTC**. Designed for [go2rtc](https://github.com/AlexxIT/go2rtc).

## Features

- **MSEVideoStream** — low-latency streaming over WebSocket using Media Source Extensions.
- **WebRTCVideoStream** — ultra-low-latency streaming via WebRTC with WebSocket signalling.
- **Automatic reconnection** with stall detection and smart backoff.
- **Full TypeScript support** with comprehensive type definitions.
- **Smart buffering** — internal queue and automatic memory trimming to prevent quota errors (MSE).
- **Broad codec support** — H.264, H.265 (HEVC), AAC, FLAC, Opus negotiated automatically.
- **ManagedMediaSource** — iOS 17+ support (MSE).
- **TCP-only ICE** — optional restriction for WebRTC in firewall-heavy environments.

## Installation

```bash
npm install react-mse-player
# or
yarn add react-mse-player
```

## Usage

### MSE

```tsx
import { MSEVideoStream } from 'react-mse-player';

<MSEVideoStream src="ws://localhost:1984/api/ws?src=camera1" />
```

### WebRTC

```tsx
import { WebRTCVideoStream } from 'react-mse-player';

<WebRTCVideoStream src="ws://localhost:1984/api/ws?src=camera1" />
```

> Both components accept a `ws://` or `wss://` URL. HTTP/HTTPS URLs are converted automatically. Relative paths (`/api/ws?src=...`) are also supported.

### Choosing between MSE and WebRTC

| | MSE | WebRTC |
| --- | --- | --- |
| Latency | ~1–3 s | < 500 ms |
| Safari iOS | 17+ only | 11+ |
| Firewall-friendly | Yes (WS) | Needs STUN/TURN |
| Audio/Video sync | Good | Excellent |

Use **WebRTC** when latency matters most. Use **MSE** as a fallback for broader compatibility.

### Advanced example

```tsx
import { WebRTCVideoStream, MSEVideoStream } from 'react-mse-player';

// WebRTC with custom ICE servers and TCP-only mode
<WebRTCVideoStream
  src="ws://localhost:1984/api/ws?src=camera1"
  mode="webrtc/tcp"
  pcConfig={{
    iceServers: [{ urls: 'turn:my-turn-server.com', username: 'user', credential: 'pass' }],
  }}
  media="video,audio"
  onStatus={(s) => console.log(s)}
  onError={(e) => console.error(e)}
  debug
/>

// MSE with stall detection timeout
<MSEVideoStream
  src="ws://localhost:1984/api/ws?src=camera1"
  dataTimeout={5000}
  media="video,audio"
  onStatus={(s) => console.log(s)}
  onError={(e) => console.error(e)}
  debug
/>
```

## Props

### Shared props (both components)

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `src` | `string` | **Required** | WebSocket URL (`ws://`, `wss://`, relative `/` path, or `http(s)://` auto-converted). |
| `width` | `string \| number` | `'100%'` | Container width. |
| `height` | `string \| number` | `'100%'` | Container height. |
| `autoPlay` | `boolean` | `true` | Start playback automatically. |
| `controls` | `boolean` | `false` | Show native video controls. |
| `media` | `string` | `'video,audio'` | Requested tracks: `'video'`, `'audio'`, or `'video,audio'`. |
| `objectFit` | `string` | `'contain'` | CSS `object-fit` for the video element. |
| `onStatus` | `(status: string) => void` | — | Status change callback. |
| `onError` | `(error: any) => void` | — | Error callback. |
| `className` | `string` | `''` | CSS class for the container. |
| `style` | `CSSProperties` | `{}` | Inline styles for the container. |
| `debug` | `boolean` | `false` | Log connection events to the console. |

### MSEVideoStream-only props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `dataTimeout` | `number` | `10000` | Milliseconds without data before triggering a reconnect. |

### WebRTCVideoStream-only props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `mode` | `'webrtc' \| 'webrtc/tcp'` | `'webrtc'` | Use `'webrtc/tcp'` to restrict ICE candidates to TCP only. |
| `pcConfig` | `RTCConfiguration` | Cloudflare + Google STUN | Override ICE servers or bundle policy. |

### Status values

| Status | Description |
| --- | --- |
| `connecting` | Opening the WebSocket connection. |
| `open` | WebSocket connected, negotiating stream. |
| `streaming` | *(MSE)* Data flowing, buffer active. |
| `connected` | *(WebRTC)* Peer connection established. |
| `reconnecting` | Connection lost, waiting to retry. |
| `closed` | Connection closed. |
| `error` | Unrecoverable error. |

## Browser Support

| Browser | MSE | WebRTC |
| --- | --- | --- |
| Chrome / Edge / Brave | ✅ | ✅ |
| Firefox | ✅ | ✅ |
| Safari 17+ | ✅ (ManagedMediaSource) | ✅ |
| Safari < 17 | ❌ | ✅ (11+) |
| Android (Chrome) | ✅ | ✅ |
| iOS Safari 17.1+ | ✅ | ✅ |
| iOS Safari < 17 | ❌ | ✅ |

## License

MIT
