# React MSE Player - Example App

This is a test example application for the React MSE Player component.

## Prerequisites

1. **go2rtc server** must be running on `http://localhost:1984`
2. A stream named `approt` should be configured in go2rtc

## Running the Example

```bash
# Make sure you're in the example directory
cd /home/contil/Projects/go2rtc/react-mse-player/example

# Install dependencies (already done)
npm install

# Start the development server
npm run dev
```

The app will open at `http://localhost:3000`

## Testing Different Streams

1. Enter a different stream URL in the input field
2. Click "Update Stream" to switch to the new stream
3. The format should be: `/api/ws?src=YOUR_STREAM_NAME`

## Status Indicators

- **CONNECTING** - Establishing WebSocket connection
- **OPEN** - WebSocket connected, setting up MediaSource
- **STREAMING** - Video is actively streaming (success!)
- **CLOSED** - Connection closed (will auto-reconnect)
- **ERROR** - An error occurred

## Troubleshooting

If the stream doesn't work:

1. Check that go2rtc is running: `http://localhost:1984`
2. Verify the stream exists in go2rtc config
3. Check browser console for errors
4. Make sure the stream name matches your go2rtc configuration
