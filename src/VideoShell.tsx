import React, { CSSProperties } from "react";

export interface VideoLabels {
  streamNotFound?: string;
  connectionFailed?: string;
  reconnecting?: string;
}

const DEFAULT_LABELS: Required<VideoLabels> = {
  streamNotFound: "Stream not found",
  connectionFailed: "Connection failed",
  reconnecting: "Reconnecting...",
};

export interface VideoShellProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  width?: string | number;
  height?: string | number;
  controls?: boolean;
  autoPlay?: boolean;
  objectFit?: "fill" | "contain" | "cover" | "none" | "scale-down";
  className?: string;
  style?: CSSProperties;
  isLoading: boolean;
  status: string;
  error: any;
  labels?: VideoLabels;
}

const VideoShell: React.FC<VideoShellProps> = ({
  videoRef,
  width = "100%",
  height = "100%",
  controls = false,
  autoPlay = true,
  objectFit = "contain",
  className = "",
  style = {},
  isLoading,
  status,
  error,
  labels,
}) => {
  const l = { ...DEFAULT_LABELS, ...labels };

  return (
    <div className={className} style={{ position: "relative", width, height, ...style }}>
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
          objectFit,
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
            <div style={{ color: "white", fontSize: 16 }}>{l.streamNotFound}</div>
          ) : error && error.toString().toLowerCase().includes("connection failed") ? (
            <div style={{ color: "white", fontSize: 16 }}>{l.connectionFailed}</div>
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
                <div style={{ color: "white", fontSize: 16 }}>{l.reconnecting}</div>
              )}
            </>
          )}
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </div>
  );
};

export default VideoShell;
