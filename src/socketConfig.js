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
  socketInstance.emit('joinStream', { channelId, userId: userId || 'guest_viewer' });
};

export const leaveStream = (channelId, userId) => {
  const socketInstance = getSocket();
  socketInstance.emit('leaveStream', { channelId, userId: userId || 'guest_viewer' });
};

/**
 * Add listener for stream events
 */
export const addStreamEndListener = (callback) => {
  const socketInstance = getSocket();
  socketInstance.on('streamEnded', (data) => {
    console.log('Received streamEnded event:', data);
    if (callback && typeof callback === 'function') {
      callback(data);
    }
  });
};

/**
 * Remove listener for stream events
 */
export const removeStreamEndListener = () => {
  const socketInstance = getSocket();
  socketInstance.off('streamEnded');
}; 