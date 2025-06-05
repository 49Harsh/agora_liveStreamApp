import React, { useState, useEffect } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import './App.css';
import LiveChat from './components/LiveChat';
import './components/LiveChat.css';

const BACKEND_URL = 'https://api.vedaz.io'; // Updated to the correct backend URL

const App = () => {
  const appId = '9b8eb3c1d1eb4e35abdb4c9268bd2d16';
  const [client, setClient] = useState(null);
  const [localAudioTrack, setLocalAudioTrack] = useState(null);
  const [localVideoTrack, setLocalVideoTrack] = useState(null);
  const [joinState, setJoinState] = useState(false);
  const [remoteUsers, setRemoteUsers] = useState([]);
  const [channelName, setChannelName] = useState('');
  const [token, setToken] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [liveStreams, setLiveStreams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentStreamId, setCurrentStreamId] = useState('');
  const [userId, setUserId] = useState(''); // For testing, in a real app this would come from authentication

  useEffect(() => {
    const init = async () => {
      const agoraClient = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
      setClient(agoraClient);
      
      // Setup event listeners
      agoraClient.on('user-published', async (user, mediaType) => {
        await agoraClient.subscribe(user, mediaType);
        console.log('subscribe success');

        if (mediaType === 'video') {
          setRemoteUsers(prevUsers => {
            return [...prevUsers.filter(u => u.uid !== user.uid), user];
          });
        }

        if (mediaType === 'audio') {
          user.audioTrack.play();
        }
      });

      agoraClient.on('user-unpublished', (user, mediaType) => {
        console.log('unpublished', user, mediaType);
        if (mediaType === 'video') {
          setRemoteUsers(prevUsers => {
            return prevUsers.filter(u => u.uid !== user.uid);
          });
        }
      });

      agoraClient.on('user-left', (user) => {
        console.log('user left', user);
        setRemoteUsers(prevUsers => {
          return prevUsers.filter(u => u.uid !== user.uid);
        });
      });
    };

    init();
    fetchLiveStreams();

    return () => {
      // Cleanup
      if (localAudioTrack) {
        localAudioTrack.close();
      }
      if (localVideoTrack) {
        localVideoTrack.close();
      }
      client?.leave();
    };
  }, []);

  const fetchLiveStreams = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${BACKEND_URL}/api/streams?isLive=true`);
      if (!response.ok) {
        throw new Error('Failed to fetch livestreams');
      }
      const data = await response.json();
      console.log('Live streams:', data);
      setLiveStreams(data.streams || []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching live streams:', error);
      setErrorMsg('Failed to fetch live streams. Please try again.');
      setLoading(false);
    }
  };

  const getToken = async (channelId) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/streams/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channelName: channelId,
          role: 'audience'
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to get token');
      }
      const data = await response.json();
      return data.token;
    } catch (error) {
      console.error('Error getting token:', error);
      setErrorMsg(`Token error: ${error.message}`);
      return null;
    }
  };

  const joinStream = async (stream) => {
    if (!client) return;
    setErrorMsg('');
    
    try {
      // Get token for this channel
      const streamToken = await getToken(stream.channelId);
      if (!streamToken) {
        throw new Error('Could not get stream token');
      }
      
      setToken(streamToken);
      setChannelName(stream.channelId);
      setCurrentStreamId(stream._id); // Set the current stream ID
      
      // Set client role as audience to receive stream
      await client.setClientRole('audience');
      
      // Join the channel with token
      await client.join(appId, stream.channelId, streamToken, null);
      setJoinState(true);
      console.log('Joined channel successfully');
      
      // Update view count
      if (stream._id) {
        try {
          const response = await fetch(`${BACKEND_URL}/streams/${stream._id}/view`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            }
          });
          console.log('View count updated');
        } catch (error) {
          console.error('Error updating view count:', error);
        }
      }
    } catch (error) {
      console.error('Error joining channel:', error);
      setErrorMsg(`${error.message || 'Failed to join channel'}`);
    }
  };

  const joinChannel = async () => {
    if (!client || !channelName) return;
    setErrorMsg('');
    
    try {
      // If no token provided, try to get one
      let streamToken = token;
      if (!streamToken) {
        streamToken = await getToken(channelName);
        setToken(streamToken);
      }
      
      // Set client role as audience to receive stream
      await client.setClientRole('audience');
      
      // Join the channel with the token
      await client.join(appId, channelName, streamToken, null);
      setJoinState(true);
      console.log('Joined channel successfully');
      
      // We might not have a streamId when joining manually, but we can try to find it
      try {
        const response = await fetch(`${BACKEND_URL}/api/streams?channelId=${channelName}`);
        if (response.ok) {
          const data = await response.json();
          if (data.streams && data.streams.length > 0) {
            setCurrentStreamId(data.streams[0]._id);
          }
        }
      } catch (error) {
        console.error('Error fetching stream ID:', error);
      }
    } catch (error) {
      console.error('Error joining channel:', error);
      setErrorMsg(`${error.message || 'Failed to join channel'}`);
    }
  };

  const leaveChannel = async () => {
    if (!client) return;
    
    // Leave the channel
    await client.leave();
    setRemoteUsers([]);
    setJoinState(false);
    setCurrentStreamId(''); // Clear the current stream ID
    console.log('Left channel successfully');
  };

  // For testing, let's simulate a login/logout
  const simulateLogin = () => {
    // In a real app, this would be actual user data from authentication
    setUserId('test_user_123');
  };

  const simulateLogout = () => {
    setUserId('');
  };

  const refreshStreams = () => {
    fetchLiveStreams();
  };

  return (
    <div className="app-container">
      <h1>Astrologer Livestream Viewer</h1>
      
      <div className="test-auth-controls">
        {!userId ? (
          <button onClick={simulateLogin}>Simulate Login</button>
        ) : (
          <button onClick={simulateLogout}>Simulate Logout</button>
        )}
        <p className="login-status">
          Status: {userId ? 'Logged in as Test User' : 'Guest User'}
        </p>
      </div>
      
      <div className="streams-section">
        <div className="section-header">
          <h2>Active Livestreams</h2>
          <button className="refresh-button" onClick={refreshStreams} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        
        <div className="streams-list">
          {loading ? (
            <div className="loading">Loading streams...</div>
          ) : liveStreams.length > 0 ? (
            liveStreams.map(stream => (
              <div className="stream-item" key={stream._id}>
                <div className="stream-info">
                  <h3>{stream.title || 'Astrology Live Session'}</h3>
                  <p>Started: {new Date(stream.startedAt).toLocaleString()}</p>
                  {stream.astrologerId && stream.astrologerId.name && (
                    <p>Astrologer: {stream.astrologerId.name}</p>
                  )}
                </div>
                <button 
                  className="join-stream-button"
                  onClick={() => joinStream(stream)}
                  disabled={joinState}
                >
                  Join Stream
                </button>
              </div>
            ))
          ) : (
            <div className="no-streams">No active livestreams available.</div>
          )}
        </div>
      </div>
      
      <div className="divider">OR</div>
      
      <div className="manual-join">
        <h2>Join Stream Manually</h2>
        <div className="join-form">
          <input
            type="text"
            placeholder="Enter channel name"
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
            disabled={joinState}
          />
          <input
            type="text"
            placeholder="Enter token (optional)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={joinState}
          />
          {!joinState ? (
            <button onClick={joinChannel} disabled={!channelName}>Join Livestream</button>
          ) : (
            <button onClick={leaveChannel}>Leave Livestream</button>
          )}
        </div>
      </div>
      
      {errorMsg && (
        <div className="error-message">
          Error: {errorMsg}
        </div>
      )}

      <div className="content-container">
        <div className="stream-container">
          {remoteUsers.length > 0 ? (
            remoteUsers.map(user => (
              <div className="remote-stream-wrapper" key={user.uid}>
                <div
                  id={`player-${user.uid}`}
                  className="stream-player"
                  ref={(el) => {
                    if (el && user.videoTrack) {
                      user.videoTrack.play(el);
                    }
                  }}
                />
              </div>
            ))
          ) : joinState ? (
            <div className="waiting-message">Waiting for livestream...</div>
          ) : (
            <div className="instructions">
              <p>Select a live stream from above or enter a channel name manually to join.</p>
              <p>Make sure the astrologer is streaming to the same channel.</p>
            </div>
          )}
        </div>
        
        {joinState && currentStreamId && (
          <div className="chat-container">
            <LiveChat 
              streamId={currentStreamId} 
              userId={userId}
              userName={userId ? 'Test User' : 'Guest'}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
