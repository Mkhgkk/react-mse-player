import { useState, useRef, useEffect } from "react";

export function toWsUrl(src: string): string {
  if (src.startsWith("http")) return "ws" + src.substring(4);
  if (src.startsWith("/")) return "ws" + window.location.origin.substring(4) + src;
  return src;
}

export function useVideoPlayer(
  onStatus: ((status: string) => void) | undefined,
  onError: ((error: any) => void) | undefined,
) {
  const [status, setStatus] = useState<string>("connecting");
  const [error, setError] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const onStatusRef = useRef(onStatus);
  const onErrorRef = useRef(onError);

  useEffect(() => { onStatusRef.current = onStatus; }, [onStatus]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const updateStatus = (s: string) => {
    setStatus(s);
    onStatusRef.current?.(s);
  };

  const updateError = (e: any) => {
    setError(e);
    onErrorRef.current?.(e);
  };

  return { status, error, isPlaying, setIsPlaying, updateStatus, updateError };
}
