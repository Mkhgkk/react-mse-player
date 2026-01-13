import React, { useEffect, useRef, useState } from "react";

const MSEVideoStream = ({
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
  showStatusOverlay = true,
}) => {
  const videoRef = useRef(null);
  const stateRef = useRef({
    ws: null,
    ms: null,
    sb: null,
    buffer: { data: new Uint8Array(2 * 1024 * 1024), length: 0 },
    lastDataTime: 0,
    reconnectTimer: null,
    stalledCheckTimer: null,
    isMounted: true,
  });

  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState(null);

  const onStatusRef = useRef(onStatus);
  const onErrorRef = useRef(onError);

  useEffect(() => { onStatusRef.current = onStatus; }, [onStatus]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const updateStatus = (s) => { setStatus(s); onStatusRef.current?.(s); };
  const updateError = (e) => { setError(e); onErrorRef.current?.(e); };

  const codecsRef = useRef([
    "avc1.640029", "avc1.64002A", "avc1.640033",
    "hvc1.1.6.L153.B0",
    "mp4a.40.2", "mp4a.40.5", "flac", "opus",
  ]);

  const getSupportedCodecs = (isSupported) => {
    return codecsRef.current
      .filter((codec) => media.includes(codec.includes("vc1") ? "video" : "audio"))
      .filter((codec) => isSupported(`video/mp4; codecs="${codec}"`))
      .join();
  };

  useEffect(() => {
    if (!src || !videoRef.current) return;

    const state = stateRef.current;
    state.isMounted = true;

    const cleanup = () => {
      console.log("Cleanup called");

      if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = null;
      }
      if (state.stalledCheckTimer) {
        clearInterval(state.stalledCheckTimer);
        state.stalledCheckTimer = null;
      }

      if (state.ws) {
        const ws = state.ws;
        state.ws = null;
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        try { ws.close(); } catch (e) {}
      }

      if (state.ms) {
        try {
          if (state.ms.readyState === "open") {
            while (state.ms.sourceBuffers.length > 0) {
              state.ms.removeSourceBuffer(state.ms.sourceBuffers[0]);
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
      state.buffer = { data: new Uint8Array(2 * 1024 * 1024), length: 0 };
      state.lastDataTime = 0;
    };

    const reconnect = () => {
      if (!state.isMounted) return;

      console.log("Reconnecting in 2 seconds...");
      cleanup();
      updateStatus("reconnecting");

      state.reconnectTimer = setTimeout(() => {
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
          console.log(`Stalled for ${timeSinceLastData}ms - reconnecting`);
          updateStatus("stalled");
          reconnect();
        }
      }, 2000);
    };

    const appendData = (data) => {
      state.lastDataTime = Date.now();

      const sb = state.sb;
      if (!sb) return;

      if (sb.updating || state.buffer.length > 0) {
        const b = new Uint8Array(data);
        if (state.buffer.length + b.byteLength <= state.buffer.data.length) {
          state.buffer.data.set(b, state.buffer.length);
          state.buffer.length += b.byteLength;
        }
      } else {
        try {
          sb.appendBuffer(data);
        } catch (e) {
          console.warn("appendBuffer error:", e);
        }
      }
    };

    const setupSourceBuffer = (codecString) => {
      if (!state.ms) return;

      console.log("Setting up SourceBuffer:", codecString);
      const sb = state.ms.addSourceBuffer(codecString);
      sb.mode = "segments";

      sb.addEventListener("updateend", () => {
        if (!sb.updating && state.buffer.length > 0) {
          try {
            sb.appendBuffer(state.buffer.data.slice(0, state.buffer.length));
            state.buffer.length = 0;
          } catch (e) {}
        }
      });

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

      state.ms.addEventListener("sourceopen", () => {
        const codecs = getSupportedCodecs(MediaSourceClass.isTypeSupported);
        console.log("MediaSource opened, codecs:", codecs);
        state.ws?.send(JSON.stringify({ type: "mse", value: codecs }));
      }, { once: true });

      if (videoRef.current) {
        if (window.ManagedMediaSource) {
          videoRef.current.disableRemotePlayback = true;
          videoRef.current.srcObject = state.ms;
        } else {
          videoRef.current.src = URL.createObjectURL(state.ms);
          videoRef.current.srcObject = null;
        }
      }
    };

    const connect = () => {
      console.log("Connecting...");
      updateStatus("connecting");
      updateError(null);

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
        console.log("WebSocket connected");
        updateStatus("open");
        setupMSE();
      };

      ws.onmessage = (ev) => {
        if (typeof ev.data === "string") {
          const msg = JSON.parse(ev.data);
          if (msg.type === "mse") {
            setupSourceBuffer(msg.value);
          } else if (msg.type === "error") {
            console.log("Stream error:", msg.value);
            updateError(msg.value);
            updateStatus("error");
            reconnect();
          }
        } else {
          appendData(ev.data);
        }
      };

      ws.onclose = () => {
        console.log("WebSocket closed");
        if (state.ws === ws) {
          state.ws = null;
          updateStatus("closed");
          reconnect();
        }
      };

      ws.onerror = () => {
        console.log("WebSocket error");
        updateError("Connection failed");
        updateStatus("error");
        reconnect();
      };
    };

    connect();

    return () => {
      state.isMounted = false;
      cleanup();
    };
  }, [src, media]);

  return (
    <div className={className} style={{ position: "relative", width, height, ...style }}>
      <video
        ref={videoRef}
        controls={controls}
        playsInline
        muted
        autoPlay
        style={{ display: "block", width: "100%", height: "100%", backgroundColor: "black" }}
      />
      {showStatusOverlay && status !== "streaming" && (
        <div style={{
          position: "absolute",
          top: 12,
          right: 12,
          color: "white",
          padding: "8px 12px",
          backgroundColor: "rgba(0,0,0,0.7)",
          borderRadius: 4,
          fontSize: 14,
        }}>
          {status === "error" ? `Error: ${error}` : status.toUpperCase()}
        </div>
      )}
    </div>
  );
};

export default MSEVideoStream;
