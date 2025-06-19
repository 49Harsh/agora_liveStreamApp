import React, { useState, useEffect, useRef } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import './App.css';
import LiveChat from './components/LiveChat';
import './components/LiveChat.css';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { 
  initializeSocket, 
  getSocket,
  joinStream as emitJoinStream, 
  leaveStream as emitLeaveStream,
  addStreamEndListener,
  removeStreamEndListener,
  addViewerCountListener,
  addUserJoinedListener
} from './socketConfig';

const BACKEND_URL = 'https://api.vedaz.io';
// const BACKEND_URL = 'http://localhost:5050';

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
  const [viewerCount, setViewerCount] = useState(0);
  const [totalViews, setTotalViews] = useState(0);
  
  // Refs for timers and stream checking
  const refreshIntervalRef = useRef(null);
  const currentStreamRef = useRef(null);

  useEffect(() => {
    // Initialize socket connection
    initializeSocket();
    
    // Setup socket event listeners
    const removeStreamEndListener = addStreamEndListener((data) => {
      console.log("Socket: Astrologer ended stream", data);
      toast.info(`${data.message || 'Live stream has ended'}`, {
        position: 'top-center',
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
      
      // Force leave channel as stream has ended
      leaveChannel();
      fetchLiveStreams(); // Refresh the streams list
    });

    // Add viewer count listener
    const removeViewerCountListener = addViewerCountListener((data) => {
      console.log("Socket: Viewer count update", data);
      
      // Update viewer count if this is for our current channel
      if (data.channelId === channelName) {
        console.log(`Updating view count UI: active=${data.activeViewers}, total=${data.totalViews}`);
        setViewerCount(data.activeViewers || 0);
        setTotalViews(data.totalViews || 0);
      } else {
        console.log(`Ignoring view count for different channel: ${data.channelId} (our channel: ${channelName})`);
      }
    });
    
    // Add user joined listener
    const removeUserJoinedListener = addUserJoinedListener((data) => {
      console.log("Socket: User joined stream", data);
      // No need to update counts here as the viewerCount event will handle that
    });

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
          const updated = prevUsers.filter(u => u.uid !== user.uid);
          console.log(`Remote users after user left: ${updated.length}`);
          
          // If no remote users are left after this user left, handle stream ending
          if (updated.length === 0 && prevUsers.length > 0) {
            console.log('Last broadcaster left, handling stream end');
            // Use setTimeout to ensure state update completes
            setTimeout(() => handleStreamEnded(), 500);
          }
          return updated;
        });
      });

      // Add connection state change handler
      agoraClient.on('connection-state-change', (curState, prevState) => {
        console.log(`Connection state changed from ${prevState} to ${curState}`);
        if (curState === 'DISCONNECTED' && joinState) {
          console.log('Disconnected from stream');
          handleStreamEnded();
        }
      });
    };

    init();
    fetchLiveStreams();

    return () => {
      // Cleanup
      removeStreamEndListener();
      removeViewerCountListener();
      removeUserJoinedListener();
      
      if (localAudioTrack) {
        localAudioTrack.close();
      }
      if (localVideoTrack) {
        localVideoTrack.close();
      }
      if (client) {
        try {
          client.leave();
        } catch (err) {
          console.log('Error leaving channel:', err);
        }
      }
      
      // Clear any intervals
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);
  
  // Add function to fetch current viewer counts from API
  const fetchViewerCount = async (streamId) => {
    if (!streamId) return;
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/streams/${streamId}/viewers`);
      if (response.ok) {
        const data = await response.json();
        console.log('Viewer count from API:', data);
        setViewerCount(data.activeViewers || 0);
        setTotalViews(data.totalViews || 0);
      }
    } catch (error) {
      console.error('Error fetching viewer count:', error);
    }
  };

  // Setup and clear stream refresh interval when join state changes
  useEffect(() => {
    if (joinState && currentStreamId) {
      // Save current stream id to ref for interval access
      currentStreamRef.current = currentStreamId;
      
      // Fetch initial viewer count
      fetchViewerCount(currentStreamId);
      
      // Set up interval to check if the current stream is still active
      refreshIntervalRef.current = setInterval(async () => {
        console.log('Checking if stream is still active...');
        checkCurrentStreamStatus();
        
        // Also refresh viewer count periodically
        fetchViewerCount(currentStreamId);
      }, 10000); // Check every 10 seconds
      
      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
          refreshIntervalRef.current = null;
        }
      };
    }
  }, [joinState, currentStreamId]);
  
  // Function to check if current stream is still active
  const checkCurrentStreamStatus = async () => {
    if (!currentStreamRef.current) return;
    
    try {
      console.log('Checking stream status from backend...');
      
      // First, try to get stream by ID which is the most reliable method
      try {
        const response = await fetch(`${BACKEND_URL}/api/streams/${currentStreamRef.current}`);
        
        if (response.ok) {
          const streamData = await response.json();
          console.log('Current stream status by ID:', streamData);
          
          // If stream is no longer live or has endedAt set, handle stream ended
          if (!streamData.isLive || streamData.endedAt) {
            console.log('Stream is no longer active according to backend');
            handleStreamEnded();
            return;
          }
        } else {
          console.log(`Stream status check by ID failed: ${response.status}`);
        }
      } catch (idError) {
        console.error('Error checking stream by ID:', idError);
      }
      
      // If we don't have a stream ID or the first check failed, try by channel ID
      if (channelName) {
        try {
          const response = await fetch(`${BACKEND_URL}/api/streams?channelId=${channelName}&isLive=true`);
          
          if (response.ok) {
            const data = await response.json();
            console.log('Stream status by channelId:', data);
            
            // If no active streams are found for this channel, it has ended
            if (!data.streams || data.streams.length === 0) {
              console.log('No active streams found for this channel');
              handleStreamEnded();
              return;
            }
          }
        } catch (channelError) {
          console.error('Error checking stream by channel:', channelError);
        }
      }
      
      // If we're showing a stream but have no remote users for more than 10 seconds
      // (and we've been connected for a while), consider it ended
      if (joinState && remoteUsers.length === 0) {
        console.log('Connected but no remote users - may have ended');
        // Add a counter for empty stream time if needed
      }
    } catch (error) {
      console.error('General error checking stream status:', error);
    }
  };

  const handleStreamEnded = () => {
    toast.info('Your live stream has ended', {
      position: 'top-center',
      autoClose: 5000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    });
    
    leaveChannel();
    fetchLiveStreams(); // Refresh the streams list
  };

  const fetchLiveStreams = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${BACKEND_URL}/api/streams?isLive=true`);
      if (!response.ok) {
        throw new Error('Failed to fetch livestreams');
      }
      const data = await response.json();
      console.log('Live streams response:', data);
      
      // Double-check stream status - only show those that are explicitly marked as active
      // Filter out any streams with endedAt set
      const currentTime = new Date();
      const activeStreams = data.streams?.filter(stream => {
        return stream.isLive === true && 
               (!stream.endedAt || new Date(stream.endedAt) > currentTime);
      }) || [];
      
      console.log(`Filtered ${activeStreams.length} active streams from ${data.streams?.length || 0} total`);
      setLiveStreams(activeStreams);
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
      
      // Notify via socket that we're joining this stream
      emitJoinStream(stream.channelId, userId || 'guest_viewer');
      
      // Update view count
      if (stream._id) {
        try {
          const response = await fetch(`${BACKEND_URL}/api/streams/${stream._id}/view`, {
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
      
      // Notify via socket that we're joining this stream
      emitJoinStream(channelName, userId || 'guest_viewer');
      
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
    
    try {
      // Notify that we're leaving the stream via socket
      if (channelName) {
        emitLeaveStream(channelName, userId || 'guest_viewer');
      }
      
      // Leave the channel
      await client.leave();
      setRemoteUsers([]);
      setJoinState(false);
      setCurrentStreamId(''); // Clear the current stream ID
      console.log('Left channel successfully');
    } catch (error) {
      console.error('Error leaving channel:', error);
      // Still update UI state
      setRemoteUsers([]);
      setJoinState(false);
      setCurrentStreamId('');
    }
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
      
      {/* Always show view counts (not conditioned on joinState) */}
      <div className="view-counts">
        <div className="live-count">
          <span className="live-indicator"></span>
          <span className="viewer-count">{viewerCount}</span> watching now
        </div>
        <div className="total-views">
          <span>{totalViews}</span> total views
        </div>
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
            <div className="waiting-message">
              {errorMsg ? `Error: ${errorMsg}` : 'Waiting for livestream...'}
            </div>
          ) : (
            <div className="instructions">
              <p>Select a live stream from above or enter a channel name manually to join.</p>
              <p>Make sure the astrologer is streaming to the same channel.</p>
            </div>
          )}
        </div>
        
        {joinState && channelName && (
          <div className="chat-container">
            <LiveChat 
              streamId={channelName}
              userId={userId}
              userName={userId ? 'Test User' : 'Guest'}
            />
          </div>
        )}
      </div>

      <ToastContainer />
    </div>
  );
};

export default App;
