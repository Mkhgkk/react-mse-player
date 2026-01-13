import React, { useState } from "react";
import { MSEVideoStream } from "react-mse-player";
import "./App.css";

function App() {
  const [streamUrl, setStreamUrl] = useState<string>("ws://localhost:1984/api/ws?src=camera1");
  const [inputValue, setInputValue] = useState<string>(streamUrl);

  const handleUpdate = () => {
    setStreamUrl(inputValue);
  };

  return (
    <div className="container">
      <h1>React MSE Player</h1>
      
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

      <div className="player-wrapper">
        <MSEVideoStream
          src={streamUrl}
          onError={(e: any) => console.error("Player error:", e)}
          onStatus={(s: string) => console.log("Player status:", s)}
          // Optional customization:
          // width="100%"
          // height="100%"
          // autoPlay={true}
          // controls={false}
          // dataTimeout={2000}
        />
      </div>

      <p className="hint">
        Check console for detailed events. Ensure your MSE-compatible WebSocket server (like go2rtc) is running.
      </p>
    </div>
  );
}

export default App;
