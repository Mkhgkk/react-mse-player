import React, { useEffect, useRef, useState, CSSProperties } from "react";
import VideoShell, { VideoLabels } from "./VideoShell";
import { useVideoPlayer, toWsUrl } from "./useVideoPlayer";

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
  objectFit?: "fill" | "contain" | "cover" | "none" | "scale-down";
  labels?: VideoLabels;
  debug?: boolean;
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
  reconnectTimer: any | null;
  stalledCheckTimer: any | null;
  lastDataTime: number;
  isMounted: boolean;
  isReconnecting: boolean;
  hasReceivedData: boolean;
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
  dataTimeout = 10000,
  objectFit = "contain",
  labels,
  debug = false,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stateRef = useRef<ComponentState>({
    ws: null,
    ms: null,
    sb: null,
    sbUpdateHandler: null,
    buffer: { data: new Uint8Array(2 * 1024 * 1024), length: 0 },
    reconnectTimer: null,
    stalledCheckTimer: null,
    lastDataTime: 0,
    isMounted: true,
    isReconnecting: false,
    hasReceivedData: false,
  });

  // Track connection start time for smart reconnect delay
  const connectTSRef = useRef<number>(0);

  const [, setHasReceivedData] = useState<boolean>(false);

  const { status, error, isPlaying, setIsPlaying, updateStatus, updateError } =
    useVideoPlayer(onStatus, onError);

  // Codecs list from VideoRTC
  const codecsRef = useRef<string[]>([
    "avc1.640029", // H.264 high 4.1 (Chromecast 1st and 2nd Gen)
    "avc1.64002A", // H.264 high 4.2 (Chromecast 3rd Gen)
    "avc1.640033", // H.264 high 5.1 (Chromecast with Google TV)
    "hvc1.1.6.L153.B0", // H.265 main 5.1 (Chromecast Ultra)
    "mp4a.40.2", // AAC LC
    "mp4a.40.5", // AAC HE
    "flac", // FLAC (PCM compatible)
    "opus", // OPUS Chrome, Firefox
  ]);

  const getSupportedCodecs = (isSupported: (type: string) => boolean) => {
    return codecsRef.current
      .filter((codec) =>
        media.includes(codec.includes("vc1") ? "video" : "audio"),
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

    const handlePlaying = () => setIsPlaying(true);

    videoRef.current.addEventListener("pause", handlePause);
    videoRef.current.addEventListener("playing", handlePlaying);

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
      state.lastDataTime = 0;
      state.hasReceivedData = false;
      setHasReceivedData(false);
      setIsPlaying(false);
    };

    const reconnect = (reason: string) => {
      if (!state.isMounted || state.isReconnecting) return;

      if (debug) console.log(`[MSEVideoStream] Starting reconnect sequence. Reason: ${reason}`);
      state.isReconnecting = true;
      cleanup();
      updateStatus("reconnecting");

      state.reconnectTimer = setTimeout(() => {
        state.isReconnecting = false;
        if (state.isMounted) {
          try {
            connect();
          } catch (e) {
            if (debug) console.error("[MSEVideoStream] Reconnect failed synchronously:", e);
            reconnect("SyncError");
          }
        }
      }, 2000);
    };

    const startStalledCheck = () => {
      if (state.stalledCheckTimer) clearInterval(state.stalledCheckTimer);

      state.stalledCheckTimer = setInterval(() => {
        if (!state.hasReceivedData || !state.lastDataTime) return;

        const now = Date.now();
        const threshold = document.hidden ? 15000 : dataTimeout;

        if (now - state.lastDataTime > threshold) {
          if (debug) console.warn(`[MSEVideoStream] Stall detected! Time since last data: ${now - state.lastDataTime}ms, Threshold: ${threshold}ms`);
          reconnect("Stall");
        }
      }, 1000);
    };

    const onMSE = (ms: MediaSource, codecString: string) => {
      if (!state.ms) return;

      const sb = ms.addSourceBuffer(codecString);
      sb.mode = "segments";

      state.sbUpdateHandler = () => {
        if (!sb.updating && state.buffer.length > 0) {
          try {
            const data = state.buffer.data.subarray(0, state.buffer.length);
            sb.appendBuffer(data as unknown as BufferSource);
            state.buffer.length = 0;
          } catch (e) {
            /* ignore */
          }
        }

        if (
          !sb.updating &&
          sb.buffered &&
          sb.buffered.length > 0 &&
          videoRef.current
        ) {
          const video = videoRef.current;
          const end = sb.buffered.end(sb.buffered.length - 1);
          const start = end - 5;
          const start0 = sb.buffered.start(0);

          if (start > start0) {
            try {
              sb.remove(start0, start);
              if (ms.setLiveSeekableRange) {
                ms.setLiveSeekableRange(start, end);
              }
            } catch (e) {}
          }

          if (video.currentTime < start) {
            video.currentTime = start;
          }

          const gap = end - video.currentTime;
          video.playbackRate = gap > 0.1 ? gap : 0.1;

          if (video.paused && !video.ended && video.readyState > 2) {
            video.play().catch(() => {});
          }
        }
      };

      sb.addEventListener("updateend", state.sbUpdateHandler);
      state.sb = sb;
      updateStatus("streaming");

      state.lastDataTime = Date.now();
      startStalledCheck();
    };

    const appendData = (data: ArrayBuffer) => {
      state.lastDataTime = Date.now();
      if (!state.hasReceivedData) {
        state.hasReceivedData = true;
        setHasReceivedData(true);
      }
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
        } catch (e) {}
      }
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
        { once: true },
      );

      if (videoRef.current) {
        if (window.ManagedMediaSource) {
          (videoRef.current as any).disableRemotePlayback = true;
          videoRef.current.srcObject = state.ms;
        } else {
          videoRef.current.src = URL.createObjectURL(state.ms);
          videoRef.current.srcObject = null;
        }
        videoRef.current.play().catch(() => {});
      }
    };

    const connect = () => {
      updateStatus("connecting");
      connectTSRef.current = Date.now();
      state.lastDataTime = Date.now();

      const wsURL = toWsUrl(src);
      if (debug) console.log("[MSEVideoStream] Connecting to:", wsURL);

      let ws: WebSocket;
      try {
        ws = new WebSocket(wsURL);
      } catch (err) {
        if (debug) console.error("[MSEVideoStream] WebSocket creation failed synchronously:", err);
        updateError(err);
        reconnect("WSCreationFail");
        return;
      }

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
            if (debug) console.warn("MSE Error:", msg.value);
            updateError(msg.value);
            reconnect("ServerMsgError");
          }
        } else {
          try {
            appendData(ev.data);
          } catch (e) {
            if (debug) console.error("AppendData error", e);
          }
        }
      };

      ws.onclose = () => {
        if (state.ws === ws) {
          state.ws = null;
          updateStatus("closed");
          reconnect("WSClosed");
        }
      };

      ws.onerror = () => {
        updateError("Connection failed");
      };
    };

    connect();

    return () => {
      state.isMounted = false;
      if (videoRef.current) {
        videoRef.current.removeEventListener("pause", handlePause);
        videoRef.current.removeEventListener("playing", handlePlaying);
      }
      cleanup();
    };
  }, [src, media]);

  const isLoading =
    status === "connecting" ||
    status === "reconnecting" ||
    (status === "streaming" && !isPlaying);

  return (
    <VideoShell
      videoRef={videoRef}
      width={width}
      height={height}
      controls={controls}
      autoPlay={autoPlay}
      objectFit={objectFit}
      className={className}
      style={style}
      isLoading={isLoading}
      status={status}
      error={error}
      labels={labels}
    />
  );
};

export default MSEVideoStream;
