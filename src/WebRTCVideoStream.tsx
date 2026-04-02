import React, { useEffect, useRef, CSSProperties } from "react";
import VideoShell from "./VideoShell";
import { useVideoPlayer, toWsUrl } from "./useVideoPlayer";

export interface WebRTCVideoStreamProps {
  src: string;
  width?: string | number;
  height?: string | number;
  controls?: boolean;
  autoPlay?: boolean;
  /**
   * Requested media tracks. Supports "video", "audio", "microphone".
   * e.g. "video,audio" or "video,audio,microphone"
   */
  media?: string;
  /**
   * WebRTC mode. Use "webrtc/tcp" to restrict ICE candidates to TCP only.
   */
  mode?: "webrtc" | "webrtc/tcp";
  /**
   * RTCPeerConnection configuration. ICE servers can be overridden here.
   */
  pcConfig?: RTCConfiguration;
  onStatus?: (status: string) => void;
  onError?: (error: any) => void;
  className?: string;
  style?: CSSProperties;
  objectFit?: "fill" | "contain" | "cover" | "none" | "scale-down";
  debug?: boolean;
}

const DEFAULT_PC_CONFIG: RTCConfiguration = {
  bundlePolicy: "max-bundle",
  iceServers: [
    {
      urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"],
    },
  ],
};

const RECONNECT_TIMEOUT = 15000;
const RECONNECT_DELAY = 2000;

interface ComponentState {
  ws: WebSocket | null;
  pc: RTCPeerConnection | null;
  isMounted: boolean;
  isReconnecting: boolean;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  connectTS: number;
}

const WebRTCVideoStream: React.FC<WebRTCVideoStreamProps> = ({
  src,
  width = "100%",
  height = "100%",
  controls = false,
  autoPlay = true,
  media = "video,audio",
  mode = "webrtc",
  pcConfig,
  onStatus,
  onError,
  className = "",
  style = {},
  objectFit = "contain",
  debug = false,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stateRef = useRef<ComponentState>({
    ws: null,
    pc: null,
    isMounted: true,
    isReconnecting: false,
    reconnectTimer: null,
    connectTS: 0,
  });

  const { status, error, isPlaying, setIsPlaying, updateStatus, updateError } =
    useVideoPlayer(onStatus, onError);

  useEffect(() => {
    if (!src || !videoRef.current) return;

    const state = stateRef.current;
    state.isMounted = true;
    state.isReconnecting = false;

    const effectPcConfig: RTCConfiguration = pcConfig ?? DEFAULT_PC_CONFIG;

    const handlePlaying = () => setIsPlaying(true);
    videoRef.current.addEventListener("playing", handlePlaying);

    const cleanup = () => {
      if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = null;
      }

      if (state.pc) {
        state.pc.getSenders().forEach((sender) => sender.track?.stop());
        state.pc.close();
        state.pc = null;
      }

      if (state.ws) {
        state.ws.onclose = null;
        state.ws.close();
        state.ws = null;
      }

      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };

    const reconnect = (reason: string) => {
      if (!state.isMounted || state.isReconnecting) return;

      if (debug) console.log(`[WebRTCVideoStream] Reconnecting. Reason: ${reason}`);
      state.isReconnecting = true;
      cleanup();
      updateStatus("reconnecting");
      setIsPlaying(false);

      const elapsed = Date.now() - state.connectTS;
      const delay = Math.max(RECONNECT_DELAY, RECONNECT_TIMEOUT - elapsed);

      state.reconnectTimer = setTimeout(() => {
        state.isReconnecting = false;
        if (state.isMounted) connect();
      }, delay);
    };

    const createOffer = async (
      pc: RTCPeerConnection,
    ): Promise<RTCSessionDescriptionInit> => {
      if (media.includes("microphone")) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((track) =>
            pc.addTransceiver(track, { direction: "sendonly" }),
          );
        } catch (e) {
          console.warn("[WebRTCVideoStream] Microphone access denied:", e);
        }
      }

      for (const kind of ["video", "audio"] as const) {
        if (media.includes(kind)) {
          pc.addTransceiver(kind, { direction: "recvonly" });
        }
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      return offer;
    };

    const connect = () => {
      updateStatus("connecting");
      updateError(null);
      state.connectTS = Date.now();

      const wsURL = toWsUrl(src);
      if (debug) console.log("[WebRTCVideoStream] Connecting to:", wsURL);

      let ws: WebSocket;
      try {
        ws = new WebSocket(wsURL);
      } catch (err) {
        if (debug) console.error("[WebRTCVideoStream] WebSocket creation failed:", err);
        updateError(err);
        reconnect("WSCreationFail");
        return;
      }

      state.ws = ws;

      ws.onopen = () => {
        if (debug) console.log("[WebRTCVideoStream] WebSocket open, setting up PeerConnection");
        updateStatus("open");

        const pc = new RTCPeerConnection(effectPcConfig);
        state.pc = pc;

        pc.addEventListener("icecandidate", (ev) => {
          if (ev.candidate && mode === "webrtc/tcp" && ev.candidate.protocol === "udp") return;
          const candidate = ev.candidate ? ev.candidate.toJSON().candidate : "";
          ws.send(JSON.stringify({ type: "webrtc/candidate", value: candidate }));
        });

        pc.addEventListener("connectionstatechange", () => {
          if (debug) console.log("[WebRTCVideoStream] PC state:", pc.connectionState);

          if (pc.connectionState === "connected") {
            updateStatus("connected");

            const tracks = pc
              .getTransceivers()
              .filter((tr) => tr.currentDirection === "recvonly")
              .map((tr) => tr.receiver.track);

            if (videoRef.current && tracks.length > 0) {
              videoRef.current.srcObject = new MediaStream(tracks);
              videoRef.current.play().catch(() => {
                if (videoRef.current && !videoRef.current.muted) {
                  videoRef.current.muted = true;
                  videoRef.current.play().catch((e) => console.warn(e));
                }
              });
            }

            // WebRTC is up — close the WS (signalling only)
            state.ws?.close();
            state.ws = null;
          } else if (
            pc.connectionState === "failed" ||
            pc.connectionState === "disconnected"
          ) {
            pc.close();
            state.pc = null;
            reconnect(`PCState:${pc.connectionState}`);
          }
        });

        ws.onmessage = (ev) => {
          if (typeof ev.data !== "string") return;

          const msg = JSON.parse(ev.data) as { type: string; value: string };
          if (debug) console.log("[WebRTCVideoStream] WS message:", msg.type);

          switch (msg.type) {
            case "webrtc/candidate":
              if (mode === "webrtc/tcp" && msg.value.includes(" udp ")) return;
              pc.addIceCandidate({ candidate: msg.value, sdpMid: "0" }).catch((e) =>
                console.warn("[WebRTCVideoStream] addIceCandidate error:", e),
              );
              break;
            case "webrtc/answer":
              pc.setRemoteDescription({ type: "answer", sdp: msg.value }).catch((e) =>
                console.warn("[WebRTCVideoStream] setRemoteDescription error:", e),
              );
              break;
            case "error":
              if (!msg.value.includes("webrtc")) return;
              updateError(msg.value);
              pc.close();
              state.pc = null;
              reconnect("ServerError");
              break;
          }
        };

        createOffer(pc)
          .then((offer) => {
            ws.send(JSON.stringify({ type: "webrtc/offer", value: offer.sdp }));
          })
          .catch((e) => {
            console.error("[WebRTCVideoStream] createOffer failed:", e);
            updateError(e);
            reconnect("OfferFailed");
          });
      };

      ws.onclose = () => {
        if (state.ws === ws) {
          state.ws = null;
          if (!state.pc || state.pc.connectionState !== "connected") {
            updateStatus("closed");
            reconnect("WSClosed");
          }
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
        videoRef.current.removeEventListener("playing", handlePlaying);
      }
      cleanup();
    };
  }, [src, media, mode]);

  const isLoading =
    status === "connecting" ||
    status === "reconnecting" ||
    (status === "connected" && !isPlaying);

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
    />
  );
};

export default WebRTCVideoStream;
