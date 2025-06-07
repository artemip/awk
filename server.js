const { createServer } = require('http');
const { Server } = require('socket.io');

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    methods: ["GET", "POST"]
  }
});

// Game state
const players = new Map();
const MAX_PLAYERS = 8;

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  
  // Handle player joining
  socket.on('player:join', (playerData) => {
    if (players.size >= MAX_PLAYERS) {
      socket.emit('error', 'Game is full');
      return;
    }

    const player = {
      id: playerData.playerId,
      socketId: socket.id,
      name: playerData.name,
      role: playerData.role,
      x: playerData.x || 400,
      y: playerData.y || 300,
    };

    players.set(playerData.playerId, player);
    console.log(`Player ${playerData.name} (${playerData.role}) joined the game`);
    
    // Send current game state to all players
    const playersArray = Array.from(players.values());
    io.emit('player:update', playersArray);
  });

  // Handle player movement
  socket.on('player:update', (updateData) => {
    const player = Array.from(players.values()).find(p => p.socketId === socket.id);
    if (player) {
      player.x = updateData.x;
      player.y = updateData.y;
      
      // Broadcast updated positions to all players
      const playersArray = Array.from(players.values());
      io.emit('player:update', playersArray);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    
    const player = Array.from(players.values()).find(p => p.socketId === socket.id);
    if (player) {
      players.delete(player.id);
      socket.broadcast.emit('player:leave', player.id);
      console.log(`Player ${player.name} left the game`);
      
      // Send updated game state
      const playersArray = Array.from(players.values());
      io.emit('player:update', playersArray);
    }
  });

  // Handle chat messages
  socket.on('message', (messageData) => {
    const player = Array.from(players.values()).find(p => p.socketId === socket.id);
    if (player) {
      io.emit('message', {
        playerId: player.id,
        playerName: player.name,
        role: player.role,
        message: messageData.message,
        timestamp: Date.now()
      });
    }
  });

  // Handle game events
  socket.on('game:start', () => {
    io.emit('game:start');
  });

  socket.on('round:end', (gameState) => {
    io.emit('round:end', gameState);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
  console.log(`Ready for up to ${MAX_PLAYERS} players`);
}); 