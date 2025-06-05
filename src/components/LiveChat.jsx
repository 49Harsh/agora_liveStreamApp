import React, { useState, useRef, useEffect } from 'react';
import './LiveChat.css';
import { 
  initializeSocket, 
  getSocket, 
  sendComment as emitComment,
  addCommentListener,
  addViewerCountListener,
  addUserJoinedListener,
  addStreamEndListener
} from '../socketConfig';

// Define BACKEND_URL constant to match App.jsx
const BACKEND_URL = 'http://localhost:5050';

const LiveChat = ({ streamId, userId, userName = 'Guest' }) => {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [totalViews, setTotalViews] = useState(0);
  const [recentJoins, setRecentJoins] = useState([]);
  const commentsEndRef = useRef(null);

  // Initialize socket connection
  useEffect(() => {
    if (!streamId) return;
    
    // Make sure socket is initialized
    initializeSocket();
    const socketInstance = getSocket();
    
    if (socketInstance) {
      setIsConnected(socketInstance.connected);
      
      // Setup connection event handlers
      const onConnect = () => {
        console.log('Socket connected');
        setIsConnected(true);
      };
      
      const onDisconnect = () => {
        console.log('Socket disconnected');
        setIsConnected(false);
      };
      
      socketInstance.on('connect', onConnect);
      socketInstance.on('disconnect', onDisconnect);
      
      // Already connected?
      if (socketInstance.connected) {
        setIsConnected(true);
      }
      
      return () => {
        socketInstance.off('connect', onConnect);
        socketInstance.off('disconnect', onDisconnect);
      };
    }
  }, [streamId]);
  
  // Setup stream-specific event listeners and join stream
  useEffect(() => {
    if (!streamId || !isConnected) return;
    
    console.log(`Setting up listeners for stream: ${streamId}`);
    
    // Join the stream room
    const socketInstance = getSocket();
    socketInstance.emit('joinStream', { 
      channelId: streamId,
      userId: userId || 'web_guest_viewer',
      userName: userName || 'Guest'
    });
    
    // Add listener for viewer count updates
    const removeViewerCountListener = addViewerCountListener((data) => {
      console.log('Viewer count update:', data);
      // Only update if this is for our channel
      if (data.channelId === streamId) {
        setViewerCount(data.activeViewers || 0);
        setTotalViews(data.totalViews || 0);
      }
    });
    
    // Add listener for comments
    const removeCommentListener = addCommentListener((comment) => {
      console.log('New comment received:', comment);
      setComments(prevComments => [...prevComments, {
        id: comment.id || Date.now().toString(),
        userName: comment.userName || 'User',
        message: comment.message,
        timestamp: comment.timestamp || new Date()
      }]);
    });
    
    // Add listener for user joined events
    const removeUserJoinedListener = addUserJoinedListener((data) => {
      console.log('User joined:', data);
      // Add system message for join
      setComments(prevComments => [...prevComments, {
        id: `join-${Date.now()}`,
        isSystemMessage: true,
        message: `${data.userName || 'Someone'} joined`,
        timestamp: data.timestamp || new Date()
      }]);
      
      // Add to recent joins list with auto-remove
      setRecentJoins(prev => [...prev, { 
        name: data.userName || 'Someone', 
        id: Date.now()
      }]);
      
      setTimeout(() => {
        setRecentJoins(prev => prev.filter(join => 
          join.name !== (data.userName || 'Someone')
        ));
      }, 5000);
    });
    
    // Add listener for stream end events
    const removeStreamEndListener = addStreamEndListener((data) => {
      console.log('Stream ended:', data);
      // Add system message for stream end
      setComments(prevComments => [...prevComments, {
        id: `end-${Date.now()}`,
        isSystemMessage: true,
        message: 'Live stream has ended',
        timestamp: new Date()
      }]);
    });
    
    // Fetch existing comments for this stream
    const fetchComments = async () => {
      try {
        console.log(`Fetching comments for stream: ${streamId}`);
        const response = await fetch(`${BACKEND_URL}/api/streams/${streamId}/comments`);
        
        if (response.ok) {
          const data = await response.json();
          console.log('Fetched comments:', data);
          
          if (data.comments && Array.isArray(data.comments) && data.comments.length > 0) {
            setComments(data.comments.map(comment => ({
              id: comment.id || Date.now().toString(),
              userName: comment.userName || 'User',
              message: comment.message || comment.content,
              timestamp: comment.timestamp || comment.createdAt || new Date()
            })));
          }
        }
      } catch (error) {
        console.error('Error fetching comments:', error);
      }
    };
    
    fetchComments();
    
    // Cleanup function
    return () => {
      // Leave the stream
      socketInstance.emit('leaveStream', {
        channelId: streamId,
        userId: userId || 'web_guest_viewer'
      });
      
      // Remove all listeners
      removeViewerCountListener();
      removeCommentListener();
      removeUserJoinedListener();
      removeStreamEndListener();
    };
  }, [streamId, userId, userName, isConnected]);
  
  // Auto-scroll to the latest comment
  useEffect(() => {
    if (comments.length > 0) {
      commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [comments]);
  
  // Send new comment
  const handleSendComment = (e) => {
    e.preventDefault();
    
    if (!newComment.trim() || !isConnected || !streamId) return;
    
    // Use the socket utility function to send comment
    emitComment(streamId, userId || 'guest_user', userName || 'Guest', newComment.trim());
    
    // Add comment to local state for immediate feedback
    setComments(prevComments => [...prevComments, {
      id: `local-${Date.now()}`,
      userName: userName || 'You',
      message: newComment.trim(),
      timestamp: new Date(),
      isLocal: true
    }]);
    
    // Clear the input
    setNewComment('');
  };

  return (
    <div className="live-chat-container">
      <div className="chat-header">
        <div className="viewer-stats">
          <div className="live-count">
            <span className="live-indicator"></span>
            <span className="count">{viewerCount}</span> watching
          </div>
          <div className="total-views">
            <span>{totalViews}</span> total views
          </div>
        </div>
        
        {recentJoins.length > 0 && (
          <div className="recent-joins">
            {recentJoins.map((join) => (
              <div key={join.id} className="join-notification">
                {join.name} joined
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div className="comments-container">
        {comments.length > 0 ? (
          comments.map((comment) => (
            <div 
              key={comment.id} 
              className={`comment ${comment.isSystemMessage ? 'system-message' : ''} ${comment.isLocal ? 'local-comment' : ''}`}
            >
              {!comment.isSystemMessage && (
                <div className="comment-user">
                  {comment.userName || 'User'}:
                </div>
              )}
              <div className="comment-content">
                {comment.message}
              </div>
              <div className="comment-time">
                {new Date(comment.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </div>
            </div>
          ))
        ) : (
          <div className="no-comments">
            No comments yet. Be the first to comment!
          </div>
        )}
        <div ref={commentsEndRef} />
      </div>
      
      <form className="comment-form" onSubmit={handleSendComment}>
        <input
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Type your comment..."
          disabled={!isConnected}
        />
        <button 
          type="submit" 
          disabled={!newComment.trim() || !isConnected}
        >
          Send
        </button>
      </form>
    </div>
  );
};

export default LiveChat; 