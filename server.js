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

// Scenario management
let currentScenario = null;
let scenarioTimer = null;
let scenarioStartTime = null;
const SCENARIO_DURATION = 30000; // 30 seconds
const SCENARIO_INTERVAL = 45000; // New scenario every 45 seconds

// Generate scenario using LLM
async function generateScenario(activePlayers) {
  const roles = activePlayers.map(p => p.role);
  const prompt = `You are generating a quick decision scenario for a neural network simulation game. 
  
  Active neural roles: ${roles.join(', ')}
  
  Create a brief scenario (1-2 sentences) that requires immediate collaborative decision-making between these neural types. The scenario should be thought-provoking and require different cognitive perspectives.
  
  Examples:
  - "A memory of childhood trauma suddenly surfaces during an important presentation. How do you respond?"
  - "You notice your friend seems depressed but claims they're fine. Trust logic or intuition?"
  - "A stranger offers you an amazing job opportunity that seems too good to be true. What's your immediate response?"
  
  Respond with just the scenario text, no additional formatting.`;

  try {
    const response = await fetch('http://localhost:3000/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.response.trim();
    }
  } catch (error) {
    console.error('Failed to generate scenario:', error);
  }
  
  // Fallback scenarios
  const fallbackScenarios = [
    "You're running late for an important meeting but see someone who needs help. What drives your decision?",
    "A childhood friend asks to borrow money for the third time this month. How do you respond?",
    "You discover a mistake in a project that could benefit you if left uncorrected. What do you do?",
    "Someone cuts in front of you in a long line. Your immediate reaction is driven by which part of your mind?",
    "You receive praise for work that was partially done by a colleague. How do you handle the recognition?"
  ];
  
  return fallbackScenarios[Math.floor(Math.random() * fallbackScenarios.length)];
}

// Start a new scenario
async function startNewScenario() {
  const activePlayers = Array.from(players.values());
  if (activePlayers.length === 0) return;
  
  const scenario = await generateScenario(activePlayers);
  currentScenario = {
    id: Date.now(),
    text: scenario,
    startTime: Date.now(),
    duration: SCENARIO_DURATION,
    responses: new Map()
  };
  
  scenarioStartTime = Date.now();
  
  // Broadcast scenario to all players
  io.emit('scenario:new', currentScenario);
  
  // Set timer for scenario end
  if (scenarioTimer) clearTimeout(scenarioTimer);
  scenarioTimer = setTimeout(() => {
    endCurrentScenario();
  }, SCENARIO_DURATION);
  
  console.log('New scenario started:', scenario);
}

// End current scenario
function endCurrentScenario() {
  if (currentScenario) {
    io.emit('scenario:end', {
      scenarioId: currentScenario.id,
      responses: Array.from(currentScenario.responses.entries())
    });
    
    console.log('Scenario ended. Responses:', currentScenario.responses.size);
    currentScenario = null;
  }
  
  // Schedule next scenario
  setTimeout(startNewScenario, SCENARIO_INTERVAL - SCENARIO_DURATION);
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Send current scenario to new player if one is active
  if (currentScenario) {
    const timeLeft = Math.max(0, SCENARIO_DURATION - (Date.now() - scenarioStartTime));
    socket.emit('scenario:current', {
      ...currentScenario,
      timeLeft
    });
  }

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
    
    // Start first scenario if this is the first player
    if (players.size === 1 && !currentScenario) {
      setTimeout(startNewScenario, 3000); // Give players time to get oriented
    }
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

  // Handle scenario responses
  socket.on('scenario:respond', (responseData) => {
    if (currentScenario && players.has(socket.id)) {
      const player = players.get(socket.id);
      currentScenario.responses.set(socket.id, {
        playerId: player.playerId,
        name: player.name,
        role: player.role,
        response: responseData.response,
        timestamp: Date.now()
      });
      
      console.log(`${player.name} (${player.role}) responded: ${responseData.response}`);
      
      // Broadcast response count update
      io.emit('scenario:response_count', currentScenario.responses.size);
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
  console.log(`Ready for up to ${MAX_PLAYERS} players`);
}); 