import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css'; // Import the CSS file
import Groq from 'groq-sdk';

const URL = 'wss://8u1yq4r426.execute-api.us-east-1.amazonaws.com/production/';
const BOT_NAME = 'RoBot';

const App = () => {
  const socket = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [members, setMembers] = useState([BOT_NAME]); // Initialize with the bot as a member
  const [chatRows, setChatRows] = useState([]);
  const [publicMessage, setPublicMessage] = useState('');
  const [privateMessage, setPrivateMessage] = useState('');
  const [recipient, setRecipient] = useState('');
  const [username, setUsername] = useState('');

  const onSocketOpen = useCallback(() => {
    console.log('WebSocket connection opened');
    setIsConnected(true);
    if (username) {
      console.log(`Setting name: ${username}`);
      socket.current.send(JSON.stringify({ action: 'setName', name: username }));
    }
  }, [username]);

  const onSocketClose = useCallback(() => {
    console.log('WebSocket connection closed');
    setMembers([BOT_NAME]); // Reset members to include only the bot
    setIsConnected(false);
    setChatRows([]);
  }, []);

  const onSocketMessage = useCallback((event) => {
    const data = JSON.parse(event.data);
    console.log(`Received message: ${event.data}`);
    if (data.members) {
      setMembers([BOT_NAME, ...data.members.filter(member => member !== BOT_NAME)]);
    } else if (data.publicMessage) {
      setChatRows(oldArray => [...oldArray, <div className="chat-bubble"><b>{data.publicMessage}</b></div>]);
      if (data.publicMessage.includes(`@${BOT_NAME}`)) {
        handleBotResponse(data.publicMessage);
      }
    } else if (data.privateMessage) {
      if (data.from === username) {
        setChatRows(oldArray => [...oldArray, <div className="chat-bubble private-message"><b>Private message to {data.to}:</b> {data.privateMessage}</div>]);
      } else {
        setChatRows(oldArray => [...oldArray, <div className="chat-bubble private-message"><b>{data.from} sent you a private message:</b> {data.privateMessage}</div>]);
      }
    } else if (data.systemMessage) {
      setChatRows(oldArray => [...oldArray, <div className="chat-bubble system-message"><i>{data.systemMessage}</i></div>]);
    }
  }, [username]);

  const groq = new Groq({ apiKey: process.env.REACT_APP_API_KEY || '', dangerouslyAllowBrowser: true });

  const handleBotResponse = async (message) => {
    try {
      const chatCompletion = await groq.chat.completions.create({
        "messages": [{ "role": "user", "content": message }],
        "model": "llama3-8b-8192",
        "temperature": 1,
        "max_tokens": 1024,
        "top_p": 1,
        "stream": true,
        "stop": null
      });

      let botReply = '';
      for await (const chunk of chatCompletion) {
        botReply += chunk.choices[0]?.delta?.content || '';
      }

      setChatRows(oldArray => [...oldArray, <div className="chat-bubble bot-message"><b>Bot:</b> {botReply}</div>]);
    } catch (error) {
      console.error('Zzzzzzz.....', error);
      setChatRows(oldArray => [...oldArray, <div className="chat-bubble bot-message"><b>Bot:</b> Sorry, there was an error processing your request.</div>]);
    }
  };

  const onConnect = useCallback(() => {
    if (!socket.current || socket.current.readyState !== WebSocket.OPEN) {
      console.log('Connecting to WebSocket');
      socket.current = new WebSocket(URL);
      socket.current.addEventListener('open', onSocketOpen);
      socket.current.addEventListener('close', onSocketClose);
      socket.current.addEventListener('message', onSocketMessage);
    }
  }, [onSocketOpen, onSocketClose, onSocketMessage]);

  useEffect(() => {
    return () => {
      console.log('Component unmounted, closing WebSocket');
      socket.current?.close();
    };
  }, []);

  const handleSendPublicMessage = useCallback(() => {
    if (publicMessage) {
      console.log(`Sending public message: ${publicMessage}`);
      socket.current.send(JSON.stringify({
        action: 'sendPublic',
        message: publicMessage,
      }));
      setPublicMessage(''); // Clear the input field after sending
    }
  }, [publicMessage]);

  const handleSendPrivateMessage = useCallback(() => {
    if (recipient && privateMessage) {
      console.log(`Sending private message to ${recipient}: ${privateMessage}`);
      socket.current.send(JSON.stringify({
        action: 'sendPrivate',
        message: privateMessage,
        to: recipient,
        from: username, // Include the sender's name
      }));
      setChatRows(oldArray => [...oldArray, <div className="chat-bubble private-message"><b>Private message to {recipient}:</b> {privateMessage}</div>]);
      setPrivateMessage(''); // Clear the input field after sending
    }
  }, [recipient, privateMessage, username]);

  const onDisconnect = useCallback(() => {
    if (isConnected) {
      console.log('Disconnecting WebSocket');
      socket.current.close();
    }
  }, [isConnected]);

  const handleKeyPress = (event, action) => {
    if (event.key === 'Enter') {
      action();
    }
  };

  return (
    <div className="app-container">
      <div className="header">
        {!isConnected ? (
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => handleKeyPress(e, onConnect)}
            placeholder="Enter your name"
            className="username-input"
          />
        ) : (
          <span className="username-display"><b>{username}</b></span>
        )}
        <button
          className={`connect-button ${isConnected ? 'disconnect-button' : ''}`}
          onClick={isConnected ? onDisconnect : onConnect}
          disabled={!username}
        >
          {isConnected ? 'Disconnect' : 'Connect'}
        </button>
      </div>
      <div className="chat-container">
        <div className="members-list">
          <h2>Members</h2>
          <ul>
            {members.map((member, index) => <li key={index}>{member}</li>)}
          </ul>
        </div>
        <div className="chat-pane">
          <h2>Chat</h2>
          <div className="chat-messages">{chatRows}</div>
          <div className="message-input">
            <input
              type="text"
              value={publicMessage}
              onChange={(e) => setPublicMessage(e.target.value)}
              onKeyDown={(e) => handleKeyPress(e, handleSendPublicMessage)}
              placeholder="Type a public message"
              disabled={!isConnected}
            />
            <button onClick={handleSendPublicMessage} disabled={!isConnected || !publicMessage}>Send</button>
          </div>
          <div className="private-message-input">
            <select
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              disabled={!isConnected || members.length === 0}
            >
              <option value="">Select recipient</option>
              {members.map((member, index) => (
                <option key={index} value={member}>{member}</option>
              ))}
            </select>
            <input
              type="text"
              value={privateMessage}
              onChange={(e) => setPrivateMessage(e.target.value)}
              onKeyDown={(e) => handleKeyPress(e, handleSendPrivateMessage)}
              placeholder="Type a private message"
              disabled={!isConnected}
            />
            <button onClick={handleSendPrivateMessage} disabled={!isConnected || !privateMessage || !recipient}>Send</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
