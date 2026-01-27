import React, { useEffect, useRef, useState, CSSProperties } from "react";

// Add support for non-standard ManagedMediaSource
declare global {
  interface Window {
    ManagedMediaSource?: typeof MediaSource;
  }
}

export interface MSEVideoStreamProps {
  src: string;
  width?: string | number;
  height?: string | number;
  controls?: boolean;
  autoPlay?: boolean;
  media?: string;
  onStatus?: (status: string) => void;
  onError?: (error: any) => void;
  className?: string;
  style?: CSSProperties;
  dataTimeout?: number;
}

interface MSEBuffer {
  data: Uint8Array;
  length: number;
}

interface ComponentState {
  ws: WebSocket | null;
  ms: MediaSource | null;
  sb: SourceBuffer | null;
  sbUpdateHandler: ((this: SourceBuffer, ev: Event) => any) | null;
  buffer: MSEBuffer;
  reconnectTimer: any | null; // NodeJS.Timeout or number
  isMounted: boolean;
  isReconnecting: boolean;
}

const MSEVideoStream: React.FC<MSEVideoStreamProps> = ({
  src,
  width = "100%",
  height = "100%",
  controls = false,
  autoPlay = true,
  media = "video,audio",
  onStatus,
  onError,
  className = "",
  style = {},
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stateRef = useRef<ComponentState>({
    ws: null,
    ms: null,
    sb: null,
    sbUpdateHandler: null,
    buffer: { data: new Uint8Array(2 * 1024 * 1024), length: 0 },
    reconnectTimer: null,
    isMounted: true,
    isReconnecting: false,
  });
  
  // Track connection start time for smart reconnect delay
  const connectTSRef = useRef<number>(0);

  const [status, setStatus] = useState<string>("connecting");
  const [error, setError] = useState<any>(null);

  const onStatusRef = useRef(onStatus);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const updateStatus = (s: string) => {
    setStatus(s);
    onStatusRef.current?.(s);
  };
  const updateError = (e: any) => {
    setError(e);
    onErrorRef.current?.(e);
  };

  // Codecs list from VideoRTC
  const codecsRef = useRef<string[]>([
    'avc1.640029',      // H.264 high 4.1 (Chromecast 1st and 2nd Gen)
    'avc1.64002A',      // H.264 high 4.2 (Chromecast 3rd Gen)
    'avc1.640033',      // H.264 high 5.1 (Chromecast with Google TV)
    'hvc1.1.6.L153.B0', // H.265 main 5.1 (Chromecast Ultra)
    'mp4a.40.2',        // AAC LC
    'mp4a.40.5',        // AAC HE
    'flac',             // FLAC (PCM compatible)
    'opus',             // OPUS Chrome, Firefox
  ]);

  const getSupportedCodecs = (isSupported: (type: string) => boolean) => {
    return codecsRef.current
      .filter((codec) =>
        media.includes(codec.includes("vc1") ? "video" : "audio")
      )
      .filter((codec) => isSupported(`video/mp4; codecs="${codec}"`))
      .join();
  };

  useEffect(() => {
    if (!src || !videoRef.current) return;

    const state = stateRef.current;
    state.isMounted = true;
    state.isReconnecting = false;

    // Helper to keep video playing in background (force play on pause)
    const handlePause = () => {
        if (
          document.hidden &&
          videoRef.current &&
          !videoRef.current.ended &&
          videoRef.current.readyState > 2
        ) {
          videoRef.current.play().catch(() => {});
        }
    };
    videoRef.current.addEventListener('pause', handlePause);

    const cleanup = () => {
      if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = null;
      }

      if (state.sb && state.sbUpdateHandler) {
        try {
          state.sb.removeEventListener("updateend", state.sbUpdateHandler);
        } catch (e) {}
        state.sbUpdateHandler = null;
      }

      if (state.ws) {
        // Prevent onclose iteration if we are manually closing
        state.ws.onclose = null; 
        state.ws.close();
        state.ws = null;
      }

      if (state.ms) {
        try {
          if (state.ms.readyState === "open") {
            const buffers = state.ms.sourceBuffers;
            for (let i = buffers.length - 1; i >= 0; i--) {
              state.ms.removeSourceBuffer(buffers[i]);
            }
          }
        } catch (e) {}
        state.ms = null;
      }

      if (videoRef.current) {
        const oldSrc = videoRef.current.src;
        videoRef.current.src = "";
        videoRef.current.srcObject = null;
        if (oldSrc?.startsWith("blob:")) {
          URL.revokeObjectURL(oldSrc);
        }
      }

      state.sb = null;
      state.buffer.length = 0;
    };

    const reconnect = () => {
      if (!state.isMounted || state.isReconnecting) return;
      
      // logic from VideoRTC: reconnect no more than once every X seconds
      const RECONNECT_TIMEOUT = 15000;
      const delay = Math.max(RECONNECT_TIMEOUT - (Date.now() - connectTSRef.current), 0);
      
      state.isReconnecting = true;
      cleanup();
      
      // If delay is significant, show reconnecting status
      if (delay > 500) {
          updateStatus("reconnecting");
      }

      state.reconnectTimer = setTimeout(() => {
        state.isReconnecting = false;
        if (state.isMounted) {
          connect();
        }
      }, delay);
    };

    const onMSE = (ms: MediaSource, codecString: string) => {
        if (!state.ms) return; // Cleanup happened?

        const sb = ms.addSourceBuffer(codecString);
        sb.mode = "segments";

        state.sbUpdateHandler = () => {
             // 1. Append pending data
             if (!sb.updating && state.buffer.length > 0) {
                try {
                    const data = state.buffer.data.subarray(0, state.buffer.length);
                    sb.appendBuffer(data as unknown as BufferSource);
                    state.buffer.length = 0;
                } catch(e) { /* ignore */ }
             }

             // 2. Buffer management and smooth playback sync (VideoRTC logic)
             if (!sb.updating && sb.buffered && sb.buffered.length > 0 && videoRef.current) {
                 const video = videoRef.current;
                 const end = sb.buffered.end(sb.buffered.length - 1);
                 const start = end - 5;
                 const start0 = sb.buffered.start(0);

                 // Trim everything older than 5 seconds from the end
                 if (start > start0) {
                     try {
                         sb.remove(start0, start);
                         // Set live seekable range so the browser knows where we are
                         if (ms.setLiveSeekableRange) {
                             ms.setLiveSeekableRange(start, end);
                         }
                     } catch(e) {}
                 }

                 // Jump forward if we fell behind the buffer window
                 if (video.currentTime < start) {
                     video.currentTime = start;
                 }

                 // Smooth playrate adjustment
                 const gap = end - video.currentTime;
                 // "gap > 0.1 ? gap : 0.1" logic from VideoRTC
                 // This effectively slows down playback if we are too close to end (to avoid stall)
                 // And speeds up playback to match gap if we are behind.
                 video.playbackRate = gap > 0.1 ? gap : 0.1;
                 
                 // Ensure we are playing
                 if (video.paused && !video.ended && video.readyState > 2) {
                     video.play().catch(() => {});
                 }
             }
        };

        sb.addEventListener("updateend", state.sbUpdateHandler);
        state.sb = sb;
        updateStatus("streaming");
    };

    const appendData = (data: ArrayBuffer) => {
        const sb = state.sb;
        if (!sb) return;

        if (sb.updating || state.buffer.length > 0) {
            const dataView = new Uint8Array(data);
             if (state.buffer.length + dataView.byteLength <= state.buffer.data.length) {
                state.buffer.data.set(dataView, state.buffer.length);
                state.buffer.length += dataView.byteLength;
             }
        } else {
            try {
                sb.appendBuffer(data as BufferSource);
            } catch(e) {}
        }
    };

    const setupMSE = () => {
      const MediaSourceClass =
        window.ManagedMediaSource || window.MediaSource;
      if (!MediaSourceClass) {
        updateError("MediaSource not supported");
        updateStatus("error");
        return;
      }

      state.ms = new MediaSourceClass();

      state.ms.addEventListener(
        "sourceopen",
        () => {
          const codecs = getSupportedCodecs(MediaSourceClass.isTypeSupported);
          state.ws?.send(JSON.stringify({ type: "mse", value: codecs }));
        },
        { once: true }
      );

      if (videoRef.current) {
        if (window.ManagedMediaSource) {
          (videoRef.current as any).disableRemotePlayback = true;
          videoRef.current.srcObject = state.ms;
        } else {
          videoRef.current.src = URL.createObjectURL(state.ms);
          videoRef.current.srcObject = null;
        }
        // Ensure play is called
        videoRef.current.play().catch(() => {});
      }
    };

    const connect = () => {
      updateStatus("connecting");
      connectTSRef.current = Date.now();

      let wsURL = src;
      if (wsURL.startsWith("http")) {
        wsURL = "ws" + wsURL.substring(4);
      } else if (wsURL.startsWith("/")) {
        wsURL = "ws" + window.location.origin.substring(4) + wsURL;
      }

      const ws = new WebSocket(wsURL);
      ws.binaryType = "arraybuffer";
      state.ws = ws;

      ws.onopen = () => {
        updateStatus("open");
        updateError(null);
        setupMSE();
      };

      ws.onmessage = (ev) => {
        if (typeof ev.data === "string") {
          const msg = JSON.parse(ev.data);
          if (msg.type === "mse") {
            onMSE(state.ms!, msg.value);
          } else if (msg.type === "error") {
            // updateError(msg.value);
            // If error, maybe try to reconnect? VideoRTC doesn't explicitly invalid on error msg, but we will logs it.
            console.warn("MSE Error:", msg.value);
          }
        } else {
          appendData(ev.data);
        }
      };

      ws.onclose = () => {
        if (state.ws === ws) {
          state.ws = null;
          updateStatus("closed");
          reconnect();
        }
      };

      ws.onerror = () => {
        // VideoRTC mostly handles onclose for reconnect logic
        updateError("Connection failed");
      };
    };

    connect();

    return () => {
      state.isMounted = false;
      if (videoRef.current) {
          videoRef.current.removeEventListener('pause', handlePause);
      }
      cleanup();
    };
  }, [src, media]);

  const isLoading =
    status === "connecting" ||
    status === "reconnecting";

  return (
    <div
      className={className}
      style={{ position: "relative", width, height, ...style }}
    >
      <video
        ref={videoRef}
        controls={controls}
        playsInline
        muted
        autoPlay={autoPlay}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          backgroundColor: "black",
        }}
      />
      {(isLoading || status === "error") && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          {error && error.toString().toLowerCase().includes("stream not found") ? (
            <div style={{ color: "white", fontSize: 16 }}>Stream not found</div>
          ) : error &&
            error.toString().toLowerCase().includes("connection failed") ? (
            <div style={{ color: "white", fontSize: 16 }}>
              Connection failed
            </div>
          ) : status === "error" ? (
            <div style={{ color: "white", fontSize: 16 }}>{error}</div>
          ) : (
            <>
              <div
                style={{
                  width: 40,
                  height: 40,
                  border: "4px solid rgba(255,255,255,0.3)",
                  borderTop: "4px solid white",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                }}
              />
              {status === "reconnecting" && (
                <div style={{ color: "white", fontSize: 16 }}>
                  Reconnecting...
                </div>
              )}
            </>
          )}
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </div>
  );
};

export default MSEVideoStream;
