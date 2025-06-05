import { io } from 'socket.io-client';

// Socket.IO client instance (singleton)
let socket = null;

// Define API URL based on environment
// const SOCKET_URL = 'https://api.vedaz.io'; // For production
// Use this for local development
const SOCKET_URL = 'ws://localhost:9000'; 

/**
 * Initialize and connect to Socket.IO server
 */
export const initializeSocket = () => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 5000,
    });

    socket.on('connect', () => {
      console.log('Socket connected');
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  }

  return socket;
};

/**
 * Get the socket instance, initializing if necessary
 */
export const getSocket = () => {
  if (!socket) {
    return initializeSocket();
  }
  return socket;
};

/**
 * Emit livestream events
 */
export const joinStream = (channelId, userId) => {
  const socketInstance = getSocket();
  if (!socketInstance) {
    console.error('Socket not initialized, cannot join stream');
    return;
  }
  
  try {
    socketInstance.emit('joinStream', { 
      channelId, 
      userId: userId || 'guest_viewer',
      userName: 'Guest Viewer'
    });
    console.log(`Socket: Joined stream ${channelId}`);
  } catch (error) {
    console.error('Error joining stream via socket:', error);
  }
};

export const leaveStream = (channelId, userId) => {
  const socketInstance = getSocket();
  if (!socketInstance) {
    console.error('Socket not initialized, cannot leave stream');
    return;
  }
  
  try {
    // Make sure both channelId and userId are defined
    if (!channelId) {
      console.warn('Cannot leave stream: channelId is undefined');
      return;
    }
    
    socketInstance.emit('leaveStream', { 
      channelId, 
      userId: userId || 'guest_viewer' 
    });
    console.log(`Socket: Left stream ${channelId}`);
  } catch (error) {
    console.error('Error leaving stream via socket:', error);
  }
};

/**
 * Send a comment in the current stream
 */
export const sendComment = (channelId, userId, userName, message) => {
  const socketInstance = getSocket();
  if (!socketInstance) {
    console.error('Socket not initialized, cannot send comment');
    return;
  }
  
  try {
    if (!channelId || !message) {
      console.warn('Cannot send comment: missing required parameters');
      return;
    }
    
    socketInstance.emit('streamComment', { 
      channelId, 
      userId: userId || 'guest_viewer',
      userName: userName || 'Guest',
      message
    });
    console.log(`Socket: Sent comment to stream ${channelId}`);
  } catch (error) {
    console.error('Error sending comment via socket:', error);
  }
};

/**
 * Add listener for stream end events
 */
export const addStreamEndListener = (callback) => {
  const socketInstance = getSocket();
  if (!socketInstance) {
    console.error('Socket not initialized, cannot add stream end listener');
    return () => {};
  }
  
  // Remove any existing listeners to avoid duplicates
  socketInstance.off('streamEnded');
  
  // Add the new listener
  socketInstance.on('streamEnded', (data) => {
    console.log('Socket: Stream ended event received:', data);
    if (callback && typeof callback === 'function') {
      callback(data);
    }
  });
  
  return () => {
    socketInstance.off('streamEnded');
  };
};

/**
 * Add listener for stream start events
 */
export const addStreamStartListener = (callback) => {
  const socketInstance = getSocket();
  if (!socketInstance) {
    console.error('Socket not initialized, cannot add stream start listener');
    return () => {};
  }
  
  // Remove any existing listeners to avoid duplicates
  socketInstance.off('streamStarted');
  
  // Add the new listener
  socketInstance.on('streamStarted', (data) => {
    console.log('Socket: Stream started event received:', data);
    if (callback && typeof callback === 'function') {
      callback(data);
    }
  });
  
  return () => {
    socketInstance.off('streamStarted');
  };
};

/**
 * Remove stream end listener
 */
export const removeStreamEndListener = () => {
  if (socket) {
    socket.off('streamEnded');
  }
};

/**
 * Add listener for comment events
 */
export const addCommentListener = (callback) => {
  const socketInstance = getSocket();
  if (!socketInstance) {
    console.error('Socket not initialized, cannot add comment listener');
    return () => {};
  }
  
  // Remove any existing listeners to avoid duplicates
  socketInstance.off('newComment');
  
  // Add the new listener
  socketInstance.on('newComment', (data) => {
    console.log('Socket: Comment received:', data);
    if (callback && typeof callback === 'function') {
      callback(data);
    }
  });
  
  return () => {
    socketInstance.off('newComment');
  };
};

/**
 * Add listener for user joined events
 */
export const addUserJoinedListener = (callback) => {
  const socketInstance = getSocket();
  if (!socketInstance) {
    console.error('Socket not initialized, cannot add user joined listener');
    return () => {};
  }
  
  // Remove any existing listeners to avoid duplicates
  socketInstance.off('userJoined');
  
  // Add the new listener
  socketInstance.on('userJoined', (data) => {
    console.log('Socket: User joined event received:', data);
    if (callback && typeof callback === 'function') {
      callback(data);
    }
  });
  
  return () => {
    socketInstance.off('userJoined');
  };
};

/**
 * Add listener for viewer count updates
 */
export const addViewerCountListener = (callback) => {
  const socketInstance = getSocket();
  if (!socketInstance) {
    console.error('Socket not initialized, cannot add viewer count listener');
    return () => {};
  }
  
  // Remove any existing listeners to avoid duplicates
  socketInstance.off('viewerCount');
  
  // Add the new listener
  socketInstance.on('viewerCount', (data) => {
    console.log('Socket: Viewer count update received:', data);
    if (callback && typeof callback === 'function') {
      callback(data);
    }
  });
  
  return () => {
    socketInstance.off('viewerCount');
  };
}; 