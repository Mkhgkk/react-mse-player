import React, { useEffect, useRef, useState } from "react";

/**
 * MSEVideoStream - React component for streaming video using Media Source Extensions (MSE)
 *
 * Props:
 * - src: WebSocket URL for the stream (e.g., "/api/ws?src=camera1" or "ws://localhost:1984/api/ws?src=camera1")
 * - width: Video width (default: '100%')
 * - height: Video height (default: '100%')
 * - controls: Show video controls (default: true)
 * - autoPlay: Auto-play video (default: true)
 * - media: Media types to request - 'video', 'audio', or 'video,audio' (default: 'video,audio')
 * - onStatus: Callback function called when status changes (optional)
 * - onError: Callback function called when error occurs (optional)
 * - className: Additional CSS class name (optional)
 * - style: Additional inline styles (optional)
 * - showStatusOverlay: Show status overlay (default: true)
 */
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
  const wsRef = useRef(null);
  const msRef = useRef(null);
  const sbRef = useRef(null);
  const bufferRef = useRef({
    data: new Uint8Array(2 * 1024 * 1024),
    length: 0,
  });
  const codecsRef = useRef([
    "avc1.640029", // H.264 high 4.1
    "avc1.64002A", // H.264 high 4.2
    "avc1.640033", // H.264 high 5.1
    "hvc1.1.6.L153.B0", // H.265 main 5.1
    "mp4a.40.2", // AAC LC
    "mp4a.40.5", // AAC HE
    "flac", // FLAC
    "opus", // OPUS
  ]);

  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState(null);

  // Use refs for callbacks to avoid re-running effect on callback changes
  const onStatusRef = useRef(onStatus);
  const onErrorRef = useRef(onError);

  // Update refs when callbacks change
  useEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  // Update status and call callback
  const updateStatus = (newStatus) => {
    setStatus(newStatus);
    if (onStatusRef.current) {
      onStatusRef.current(newStatus);
    }
  };

  // Update error and call callback
  const updateError = (newError) => {
    setError(newError);
    if (onErrorRef.current) {
      onErrorRef.current(newError);
    }
  };

  // Filter codecs based on media type and browser support
  const getSupportedCodecs = (isSupported) => {
    return codecsRef.current
      .filter((codec) =>
        media.includes(codec.includes("vc1") ? "video" : "audio")
      )
      .filter((codec) => isSupported(`video/mp4; codecs="${codec}"`))
      .join();
  };

  // Handle Safari codec limitations
  useEffect(() => {
    const m = window.navigator.userAgent.match(/Version\/(\d+).+Safari/);
    if (m) {
      const skip = m[1] < "13" ? "mp4a.40.2" : m[1] < "14" ? "flac" : "opus";
      const index = codecsRef.current.indexOf(skip);
      if (index > -1) {
        codecsRef.current.splice(index);
      }
    }
  }, []);

  useEffect(() => {
    if (!src || !videoRef.current) return;

    let ws = null;
    let ms = null;
    let reconnectTimeout = null;

    const setupMSE = () => {
      if ("ManagedMediaSource" in window) {
        const MediaSource = window.ManagedMediaSource;
        ms = new MediaSource();

        ms.addEventListener(
          "sourceopen",
          () => {
            const codecs = getSupportedCodecs(MediaSource.isTypeSupported);
            console.log("ManagedMediaSource opened, supported codecs:", codecs);
            ws?.send(JSON.stringify({ type: "mse", value: codecs }));
          },
          { once: true }
        );

        if (videoRef.current) {
          videoRef.current.disableRemotePlayback = true;
          videoRef.current.srcObject = ms;
        }
      } else if ("MediaSource" in window) {
        ms = new MediaSource();

        ms.addEventListener(
          "sourceopen",
          () => {
            if (videoRef.current) {
              URL.revokeObjectURL(videoRef.current.src);
            }
            const codecs = getSupportedCodecs(MediaSource.isTypeSupported);
            console.log("MediaSource opened, supported codecs:", codecs);
            ws?.send(JSON.stringify({ type: "mse", value: codecs }));
          },
          { once: true }
        );

        if (videoRef.current) {
          videoRef.current.src = URL.createObjectURL(ms);
          videoRef.current.srcObject = null;
        }
      } else {
        updateError("MediaSource API not supported in this browser");
        updateStatus("error");
        return;
      }

      msRef.current = ms;
    };

    const setupSourceBuffer = (codecString) => {
      if (!ms) return;

      console.log("Setting up SourceBuffer with codecs:", codecString);
      const sb = ms.addSourceBuffer(codecString);
      sb.mode = "segments";

      // Simple approach - just append pending data, nothing else
      sb.addEventListener("updateend", () => {
        if (!sb.updating && bufferRef.current.length > 0) {
          try {
            const data = bufferRef.current.data.slice(
              0,
              bufferRef.current.length
            );
            sb.appendBuffer(data);
            bufferRef.current.length = 0;
          } catch (e) {
            console.warn("Buffer append failed:", e);
          }
        }
      });

      sb.addEventListener("error", (e) => {
        console.error("SourceBuffer error:", e);
      });

      sbRef.current = sb;
    };

    const appendData = (data) => {
      const sb = sbRef.current;
      if (!sb) return;

      // Simple approach: if updating, queue it; otherwise append directly
      if (sb.updating || bufferRef.current.length > 0) {
        const b = new Uint8Array(data);
        if (
          bufferRef.current.length + b.byteLength <=
          bufferRef.current.data.length
        ) {
          bufferRef.current.data.set(b, bufferRef.current.length);
          bufferRef.current.length += b.byteLength;
        }
      } else {
        try {
          sb.appendBuffer(data);
        } catch (e) {
          console.warn("appendBuffer error:", e);
        }
      }
    };

    const connect = () => {
      updateStatus("connecting");
      updateError(null);

      // Convert HTTP URL to WebSocket URL
      let wsURL = src;
      if (typeof wsURL === "string") {
        if (wsURL.startsWith("http")) {
          wsURL = "ws" + wsURL.substring(4);
        } else if (wsURL.startsWith("/")) {
          wsURL = "ws" + window.location.origin.substring(4) + wsURL;
        }
      }

      console.log("Connecting to WebSocket:", wsURL);
      ws = new WebSocket(wsURL);
      ws.binaryType = "arraybuffer";

      ws.addEventListener("open", () => {
        console.log("WebSocket connected");
        updateStatus("open");
        updateError(null);
        setupMSE();
      });

      ws.addEventListener("message", (ev) => {
        if (typeof ev.data === "string") {
          const msg = JSON.parse(ev.data);
          console.log("WebSocket message:", msg);

          if (msg.type === "mse") {
            setupSourceBuffer(msg.value);
            updateStatus("streaming");
          } else if (msg.type === "error") {
            updateError(msg.value);
            updateStatus("error");
            console.error("Stream error:", msg.value);
          }
        } else {
          // Binary data
          appendData(ev.data);
        }
      });

      ws.addEventListener("close", () => {
        console.log("WebSocket closed, will reconnect in 5s");
        updateStatus("closed");
        ws = null;

        // Reconnect after 5 seconds
        reconnectTimeout = setTimeout(() => {
          connect();
        }, 5000);
      });

      ws.addEventListener("error", (err) => {
        console.error("WebSocket error:", err);
        updateError("WebSocket connection failed");
      });

      wsRef.current = ws;
    };

    connect();

    // Cleanup
    return () => {
      console.log("Cleaning up MSEVideoStream");
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }

      if (ws) {
        ws.close();
      }

      // Properly cleanup MediaSource
      if (ms) {
        try {
          if (ms.readyState === "open") {
            // Remove all source buffers first
            while (ms.sourceBuffers.length > 0) {
              ms.removeSourceBuffer(ms.sourceBuffers[0]);
            }
          }
        } catch (e) {
          console.warn("Error cleaning up MediaSource:", e);
        }
      }

      if (videoRef.current) {
        const oldSrc = videoRef.current.src;
        videoRef.current.src = "";
        videoRef.current.srcObject = null;

        // Revoke object URL if it was created
        if (oldSrc && oldSrc.startsWith("blob:")) {
          URL.revokeObjectURL(oldSrc);
        }
      }

      // Clear refs
      wsRef.current = null;
      msRef.current = null;
      sbRef.current = null;
      bufferRef.current = { data: new Uint8Array(2 * 1024 * 1024), length: 0 };
    };
  }, [src, media]);

  const containerStyle = {
    position: "relative",
    width,
    height,
    ...style,
  };

  const videoStyle = {
    display: "block",
    width: "100%",
    height: "100%",
    backgroundColor: "black",
  };

  const statusOverlayStyle = {
    position: "absolute",
    top: 12,
    right: 12,
    color: "white",
    padding: "8px 12px",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderRadius: 4,
    fontSize: 14,
    fontFamily: "Arial, sans-serif",
  };

  return (
    <div className={className} style={containerStyle}>
      <video
        ref={videoRef}
        controls={controls}
        playsInline
        preload="auto"
        muted={true}
        autoPlay={true}
        style={videoStyle}
      />
      {showStatusOverlay && status !== "streaming" && (
        <div style={statusOverlayStyle}>
          {status === "error" ? `Error: ${error}` : status.toUpperCase()}
        </div>
      )}
    </div>
  );
};

export default MSEVideoStream;
