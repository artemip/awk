/* eslint-disable @typescript-eslint/no-explicit-any */
let socket: any = null;
let io: any = null;

// Dynamically import socket.io-client to avoid module resolution issues
const getIO = async () => {
  if (!io) {
    const socketIOClient = await import('socket.io-client');
    io = socketIOClient.default;
  }
  return io;
};

export const initializeSocket = async (serverUrl: string = 'http://localhost:3001'): Promise<any> => {
  if (!socket) {
    const ioFunction = await getIO();
    socket = ioFunction(serverUrl, {
      autoConnect: false,
      transports: ['websocket', 'polling']
    });
  }
  return socket;
};

export const getSocket = (): any => {
  return socket;
};

export const disconnectSocket = (): void => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

// Game-specific socket events
export const socketEvents = {
  // Player events
  PLAYER_JOIN: 'player:join',
  PLAYER_LEAVE: 'player:leave',
  PLAYER_UPDATE: 'player:update',
  
  // Game events
  GAME_START: 'game:start',
  GAME_UPDATE: 'game:update',
  GAME_END: 'game:end',
  ROUND_START: 'round:start',
  ROUND_END: 'round:end',
  
  // Communication events
  MESSAGE: 'message',
  DIALOGUE: 'dialogue',
  
  // Error events
  ERROR: 'error',
  DISCONNECT: 'disconnect',
  CONNECT: 'connect'
};

export default { initializeSocket, getSocket, disconnectSocket, socketEvents }; 