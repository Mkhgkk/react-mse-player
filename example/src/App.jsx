import React, { useState } from 'react';
import { MSEVideoStream } from 'react-mse-player';
import './App.css';

function App() {
  const [streamUrl, setStreamUrl] = useState('ws://localhost:1984/api/ws?src=approt');
  const [status, setStatus] = useState('initializing');
  const [error, setError] = useState(null);
  const [inputValue, setInputValue] = useState('ws://localhost:1984/api/ws?src=approt');
  const [streams, setStreams] = useState([]);

  const handleStatus = (newStatus) => {
    console.log('Stream status:', newStatus);
    setStatus(newStatus);
  };

  const handleError = (newError) => {
    console.error('Stream error:', newError);
    setError(newError);
  };

  const updateStream = () => {
    setStreamUrl(inputValue);
    setError(null);
  };

  return (
    <div className="app">
      <header className="header">
        <h1>React MSE Player - Test</h1>
        <p>Testing MSE streaming with go2rtc</p>
      </header>

      <div className="controls">
        <div className="control-group">
          <label htmlFor="streamUrl">Stream URL:</label>
          <input
            id="streamUrl"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="ws://localhost:1984/api/ws?src=approt"
          />
          <button onClick={updateStream}>Update Stream</button>
        </div>

        <div className="status-info">
          <div className={`status-badge ${status}`}>
            Status: <strong>{status.toUpperCase()}</strong>
          </div>
          {error && (
            <div className="error-badge">
              Error: <strong>{error}</strong>
            </div>
          )}
        </div>
      </div>

      <div className="video-wrapper">
        <MSEVideoStream
          src={streamUrl}
          width="100%"
          height="100%"
          controls={true}
          autoPlay={true}
          media="video,audio"
          onStatus={handleStatus}
          onError={handleError}
          showStatusOverlay={true}
        />
      </div>

      <div className="info">
        <h3>Connection Details</h3>
        <ul>
          <li><strong>Stream Source:</strong> <code>approt</code></li>
          <li><strong>WebSocket URL:</strong> <code>{streamUrl}</code></li>
          <li><strong>go2rtc Server:</strong> <code>http://localhost:1984</code></li>
        </ul>

        <h3>Instructions</h3>
        <ol>
          <li>Make sure go2rtc is running on <code>http://localhost:1984</code></li>
          <li>Ensure the stream <code>approt</code> is configured in go2rtc</li>
          <li>The video should start streaming automatically</li>
          <li>Check the browser console for detailed logs</li>
        </ol>

        <h3>Status Reference</h3>
        <ul>
          <li><strong>connecting:</strong> Establishing WebSocket connection</li>
          <li><strong>open:</strong> WebSocket connected, initializing MSE</li>
          <li><strong>streaming:</strong> Video is actively streaming</li>
          <li><strong>closed:</strong> Connection closed (will auto-reconnect in 5s)</li>
          <li><strong>error:</strong> An error occurred</li>
        </ul>
      </div>
    </div>
  );
}

export default App;
