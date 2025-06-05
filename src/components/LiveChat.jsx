import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = 'https://api.vedaz.io:9000';

const LiveChat = ({ streamId, userId, userName = 'Guest' }) => {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [totalViews, setTotalViews] = useState(0);
  const [recentJoins, setRecentJoins] = useState([]);
  const [isLoggedIn, setIsLoggedIn] = useState(!!userId);
  const [sessionId, setSessionId] = useState('');
  
  const commentsEndRef = useRef(null);

  // Initialize socket connection
  useEffect(() => {
    if (!streamId) return;
    
    // Initialize Socket.io connection
    const socketInstance = io(SOCKET_URL, {
      transports: ['websocket'],
      autoConnect: true,
    });
    
    setSocket(socketInstance);
    
    // Socket event listeners
    socketInstance.on('connect', () => {
      console.log('Socket connected');
      setIsConnected(true);
      
      // Join the stream room
      socketInstance.emit('joinStream', {
        streamId,
        userId,
        sessionId: sessionId || undefined
      });
    });
    
    socketInstance.on('joinedStream', (data) => {
      console.log('Joined stream:', data);
      if (data.sessionId && !sessionId) {
        setSessionId(data.sessionId);
      }
      setViewerCount(data.viewerCount);
      setTotalViews(data.totalViews);
    });
    
    socketInstance.on('viewerCount', (data) => {
      console.log('Viewer count update:', data);
      setViewerCount(data.count);
      setTotalViews(data.totalViews);
    });
    
    socketInstance.on('newComment', (comment) => {
      console.log('New comment:', comment);
      setComments(prevComments => [...prevComments, comment]);
    });
    
    socketInstance.on('viewerJoined', (data) => {
      console.log('Viewer joined:', data);
      const joinMessage = {
        _id: Date.now(),
        isSystemMessage: true,
        content: `${data.name} joined`,
        timestamp: data.timestamp
      };
      
      setComments(prevComments => [...prevComments, joinMessage]);
      
      // Add to recent joins with auto-remove after 5 seconds
      setRecentJoins(prev => [...prev, { name: data.name, isGuest: data.isGuest }]);
      setTimeout(() => {
        setRecentJoins(prev => prev.filter(join => join.name !== data.name));
      }, 5000);
    });
    
    socketInstance.on('viewerLeft', (data) => {
      console.log('Viewer left:', data);
      setViewerCount(data.viewerCount);
    });
    
    socketInstance.on('streamEnded', () => {
      console.log('Stream ended');
      const endMessage = {
        _id: Date.now(),
        isSystemMessage: true,
        content: 'Live stream has ended',
        timestamp: new Date()
      };
      
      setComments(prevComments => [...prevComments, endMessage]);
    });
    
    socketInstance.on('error', (error) => {
      console.error('Socket error:', error);
    });
    
    socketInstance.on('disconnect', () => {
      console.log('Socket disconnected');
      setIsConnected(false);
    });
    
    // Fetch existing comments for this stream
    const fetchComments = async () => {
      try {
        const response = await fetch(`https://api.vedaz.io/api/streams/${streamId}/comments`);
        if (response.ok) {
          const data = await response.json();
          if (data.comments && Array.isArray(data.comments)) {
            setComments(data.comments);
          }
        }
      } catch (error) {
        console.error('Error fetching comments:', error);
      }
    };
    
    fetchComments();
    
    // Cleanup function
    return () => {
      if (socketInstance) {
        socketInstance.emit('leaveStream');
        socketInstance.disconnect();
      }
    };
  }, [streamId, userId]);
  
  // Auto-scroll to the latest comment
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);
  
  // Send new comment
  const sendComment = (e) => {
    e.preventDefault();
    
    if (!newComment.trim() || !socket || !isConnected) return;
    
    if (!isLoggedIn) {
      // Show login prompt
      alert('Please login or register to comment');
      return;
    }
    
    socket.emit('sendComment', {
      streamId,
      userId,
      content: newComment.trim()
    });
    
    // Clear the input (optimistic UI update)
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
            {recentJoins.map((join, index) => (
              <div key={index} className="join-notification">
                {join.name} joined
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div className="comments-container">
        {comments.length > 0 ? (
          comments.map(comment => (
            <div 
              key={comment._id} 
              className={`comment ${comment.isSystemMessage ? 'system-message' : ''}`}
            >
              {!comment.isSystemMessage && (
                <div className="comment-user">
                  {comment.user?.name || 'User'}:
                </div>
              )}
              <div className="comment-content">
                {comment.content}
              </div>
              <div className="comment-time">
                {new Date(comment.createdAt || comment.timestamp).toLocaleTimeString()}
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
      
      <form className="comment-form" onSubmit={sendComment}>
        <input
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder={isLoggedIn ? "Type your comment..." : "Login to comment..."}
          disabled={!isLoggedIn || !isConnected}
        />
        <button 
          type="submit" 
          disabled={!isLoggedIn || !newComment.trim() || !isConnected}
        >
          Send
        </button>
      </form>
    </div>
  );
};

export default LiveChat; 