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
  lastDataTime: number;
  reconnectTimer: any | null; // NodeJS.Timeout or number
  stalledCheckTimer: any | null;
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
    lastDataTime: 0,
    reconnectTimer: null,
    stalledCheckTimer: null,
    isMounted: true,
    isReconnecting: false,
  });

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

  const codecsRef = useRef<string[]>([
    "avc1.640029",
    "avc1.64002A",
    "avc1.640033",
    "hvc1.1.6.L153.B0",
    "mp4a.40.2",
    "mp4a.40.5",
    "flac",
    "opus",
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

    const cleanup = () => {
      if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = null;
      }
      if (state.stalledCheckTimer) {
        clearInterval(state.stalledCheckTimer);
        state.stalledCheckTimer = null;
      }

      if (state.sb && state.sbUpdateHandler) {
        try {
          state.sb.removeEventListener("updateend", state.sbUpdateHandler);
        } catch (e) {}
        state.sbUpdateHandler = null;
      }

      if (state.ws) {
        const ws = state.ws;
        state.ws = null;
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        try {
          ws.close();
        } catch (e) {}
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
      state.lastDataTime = 0;
    };

    const reconnect = () => {
      if (!state.isMounted || state.isReconnecting) return;
      state.isReconnecting = true;

      cleanup();
      updateStatus("reconnecting");

      state.reconnectTimer = setTimeout(() => {
        state.isReconnecting = false;
        if (state.isMounted) {
          connect();
        }
      }, 2000);
    };

    const startStalledCheck = () => {
      if (state.stalledCheckTimer) {
        clearInterval(state.stalledCheckTimer);
      }

      state.stalledCheckTimer = setInterval(() => {
        if (!state.lastDataTime) return;

        const timeSinceLastData = Date.now() - state.lastDataTime;
        if (timeSinceLastData > 2000) {
          updateStatus("stalled");
          reconnect();
        }
      }, 2000);
    };

    const trimBuffer = () => {
      const sb = state.sb;
      if (!sb || sb.updating) return;

      try {
        if (sb.buffered.length > 0) {
          const currentTime = videoRef.current?.currentTime || 0;
          const bufferedStart = sb.buffered.start(0);
          if (currentTime - bufferedStart > 10) {
            sb.remove(bufferedStart, currentTime - 5);
          }
        }
      } catch (e) {}
    };

    const appendData = (data: ArrayBuffer) => {
      state.lastDataTime = Date.now();

      const sb = state.sb;
      if (!sb) return;

      if (sb.updating || state.buffer.length > 0) {
        const dataView = new Uint8Array(data);
        if (
          state.buffer.length + dataView.byteLength <=
          state.buffer.data.length
        ) {
          state.buffer.data.set(dataView, state.buffer.length);
          state.buffer.length += dataView.byteLength;
        }
      } else {
        try {
          sb.appendBuffer(data as BufferSource);
        } catch (e: any) {
          if (e.name === "QuotaExceededError") {
            trimBuffer();
          }
        }
      }
    };

    const setupSourceBuffer = (codecString: string) => {
      if (!state.ms) return;

      const sb = state.ms.addSourceBuffer(codecString);
      sb.mode = "segments";

      state.sbUpdateHandler = () => {
        if (!sb.updating && state.buffer.length > 0) {
          try {
            const data = state.buffer.data.subarray(0, state.buffer.length);
            sb.appendBuffer(data as unknown as BufferSource);
            state.buffer.length = 0;
          } catch (e: any) {
            if (e.name === "QuotaExceededError") {
              trimBuffer();
            }
          }
        }
        trimBuffer();
      };

      sb.addEventListener("updateend", state.sbUpdateHandler);
      state.sb = sb;
      updateStatus("streaming");
      startStalledCheck();
    };

    const setupMSE = () => {
      const MediaSourceClass = window.ManagedMediaSource || window.MediaSource;
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
      }
    };

    const connect = () => {
      updateStatus("connecting");
      // updateError(null);

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
            setupSourceBuffer(msg.value);
          } else if (msg.type === "error") {
            updateError(msg.value);
            updateStatus("error");
            reconnect();
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
        updateError("Connection failed");
        updateStatus("error");
      };
    };

    connect();

    return () => {
      state.isMounted = false;
      cleanup();
    };
  }, [src, media]);

  const isLoading =
    status === "connecting" ||
    status === "reconnecting" ||
    status === "stalled";

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
