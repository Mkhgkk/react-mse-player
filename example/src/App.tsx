import React, { useState } from "react";
import { MSEVideoStream, WebRTCVideoStream } from "react-mse-player";
import "./App.css";

type Mode = "mse" | "webrtc";

function App() {
  const [streamUrl, setStreamUrl] = useState<string>(
    "ws://localhost:1984/api/ws?src=camera1",
  );
  const [inputValue, setInputValue] = useState<string>(streamUrl);
  const [mode, setMode] = useState<Mode>("webrtc");

  const handleUpdate = () => {
    setStreamUrl(inputValue);
  };

  return (
    <div className="container">
      <h1>Go2RTC MSE/WebRTC Player</h1>

      <div className="controls">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Enter WebSocket URL (e.g. ws://localhost:1984/api/ws?src=camera1)"
          className="url-input"
        />
        <button onClick={handleUpdate} className="play-btn">
          Load Stream
        </button>
      </div>

      <div className="mode-toggle">
        <button
          onClick={() => setMode("webrtc")}
          className={`mode-btn ${mode === "webrtc" ? "active" : ""}`}
        >
          WebRTC
        </button>
        <button
          onClick={() => setMode("mse")}
          className={`mode-btn ${mode === "mse" ? "active" : ""}`}
        >
          MSE
        </button>
      </div>

      <div className="player-wrapper">
        {mode === "webrtc" ? (
          <WebRTCVideoStream
            key="webrtc"
            src={streamUrl}
            onError={(e: any) => console.error("Player error:", e)}
            onStatus={(s: string) => console.log("Player status:", s)}
            // Optional customization:
            // width="100%"
            // height="100%"
            // autoPlay={true}
            // controls={false}
            // dataTimeout={5000}
            debug={true}
          />
        ) : (
          <MSEVideoStream
            key="mse"
            src={streamUrl}
            onError={(e: any) => console.error("Player error:", e)}
            onStatus={(s: string) => console.log("Player status:", s)}
            // Optional customization:
            // width="100%"
            // height="100%"
            // autoPlay={true}
            // controls={false}
            // dataTimeout={5000}
            debug={true}
          />
        )}
      </div>

      <p className="hint">
        Check console for detailed events. Ensure your go2rtc server is running.
      </p>
    </div>
  );
}

export default App;
