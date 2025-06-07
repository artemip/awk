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

// Scenario management - Party Brain Edition
let currentScenario = null;
let scenarioTimer = null;
let scenarioStartTime = null;
let currentRound = 0;
const MAX_ROUNDS = 4;
const ROUND_DURATIONS = [30000, 20000, 10000, 5000]; // 30s, 20s, 10s, 5s
const SCENARIO_INTERVAL = 45000; // Time between scenarios

// Game scoring
const gameState = {
  mentalStability: 50,
  socialReputation: 50,
  chaos: 50,
  teamResponses: []
};

// Generate Party Brain scenarios using LLM
async function generatePartyBrainScenario(activePlayers) {
  const roles = activePlayers.map(p => p.role);
  const prompt = `You are generating an awkward, chaotic, or emotionally charged life situation for "The Hive Mind: Party Brain Edition" game.

  Active neural roles: ${roles.join(', ')}

  Create a brief, relatable scenario (1-2 sentences) that puts someone in an uncomfortable social situation requiring immediate emotional response. The scenario should be:
  - Awkward or emotionally charged
  - Something people can relate to
  - Requires choosing between approach vs avoidance AND vindictive vs empathetic responses

  Examples:
  - "Your mom accidentally likes an ex's Instagram post from your phone."
  - "You realize you've been mispronouncing your coworker's name for 6 months."
  - "Your friend asks if you like their terrible new haircut while they're clearly fishing for compliments."
  - "You walk into a public bathroom and realize you're in the wrong gender's restroom, but someone saw you enter."

  Respond with just the scenario text, no additional formatting.`;

  try {
    const response = await fetch('http://localhost:3002/api/llm', {
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
  
  // Fallback party brain scenarios
  const fallbackScenarios = [
    "Your mom accidentally likes an ex's Instagram post from your phone.",
    "You realize you've been mispronouncing your coworker's name for 6 months.",
    "Your friend asks if you like their terrible new haircut while they're clearly fishing for compliments.",
    "You walk into a public bathroom and realize you're in the wrong gender's restroom, but someone saw you enter.",
    "Your Uber driver starts crying and tells you about their divorce.",
    "You accidentally send a screenshot of someone's text to that same person.",
    "Your boss asks you to work weekend hours but frames it as 'a great opportunity'.",
    "You're at dinner and your friend's card gets declined, everyone's looking at you."
  ];
  
  return fallbackScenarios[Math.floor(Math.random() * fallbackScenarios.length)];
}

// Generate dynamic emotional axes for a scenario using LLM
async function generateDynamicAxes(scenario) {
  const prompt = `Given this awkward/emotionally charged scenario, generate the two most relevant psychological/emotional dimensions for decision-making.

Scenario: "${scenario}"

Respond with exactly this JSON format:
{
  "axis1": {
    "negative": "word or short phrase",
    "positive": "word or short phrase"
  },
  "axis2": {
    "negative": "word or short phrase", 
    "positive": "word or short phrase"
  }
}

The axes should represent the most psychologically relevant dimensions for this specific situation. Common examples include:
- Approach ↔ Avoidance
- Empathetic ↔ Vindictive
- Assertive ↔ Passive
- Honest ↔ Deceptive
- Rational ↔ Emotional
- Confrontational ↔ Accommodating

Choose the most contextually appropriate pair for this scenario.`;

  try {
    const response = await fetch('http://localhost:3002/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, requestType: 'axes' })
    });
    
    if (response.ok) {
      const data = await response.json();
      try {
        const axes = JSON.parse(data.response.trim());
        return axes;
      } catch (parseError) {
        console.error('Failed to parse axes JSON:', parseError);
        return getDefaultAxes();
      }
    }
  } catch (error) {
    console.error('Failed to generate dynamic axes:', error);
  }
  
  return getDefaultAxes();
}

// Generate ideal response using LLM
async function generateIdealResponse(scenario, axes) {
  const prompt = `Given this scenario and emotional axes, determine the ideal/best emotional response position.

Scenario: "${scenario}"

Axis 1: ${axes.axis1.negative} (-1) ↔ ${axes.axis1.positive} (+1)
Axis 2: ${axes.axis2.negative} (-1) ↔ ${axes.axis2.positive} (+1)

Consider what would be the most psychologically healthy, socially appropriate, and effective response to this situation. Respond with exactly this JSON format:

{
  "axis1_value": number_between_-1_and_1,
  "axis2_value": number_between_-1_and_1,
  "reasoning": "brief explanation of why this is ideal"
}

Example: If the ideal response is moderately empathetic and slightly avoidant, you might return:
{"axis1_value": -0.3, "axis2_value": 0.6, "reasoning": "Slight avoidance prevents escalation while empathy maintains relationships"}`;

  try {
    const response = await fetch('http://localhost:3002/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, requestType: 'ideal' })
    });
    
    if (response.ok) {
      const data = await response.json();
      try {
        const ideal = JSON.parse(data.response.trim());
        return {
          axis1: Math.max(-1, Math.min(1, ideal.axis1_value)),
          axis2: Math.max(-1, Math.min(1, ideal.axis2_value)),
          reasoning: ideal.reasoning
        };
      } catch (parseError) {
        console.error('Failed to parse ideal response JSON:', parseError);
        return getRandomIdeal();
      }
    }
  } catch (error) {
    console.error('Failed to generate ideal response:', error);
  }
  
  return getRandomIdeal();
}

// Default axes fallback
function getDefaultAxes() {
  return {
    axis1: { negative: "Avoidance", positive: "Approach" },
    axis2: { negative: "Vindictive", positive: "Empathetic" }
  };
}

// Random ideal fallback
function getRandomIdeal() {
  return {
    axis1: (Math.random() - 0.5) * 2,
    axis2: (Math.random() - 0.5) * 2,
    reasoning: "Randomly generated fallback"
  };
}

// Start a new scenario
async function startNewScenario() {
  const activePlayers = Array.from(players.values());
  if (activePlayers.length === 0) return;
  
  const scenario = await generatePartyBrainScenario(activePlayers);
  
  // Generate dynamic axes for this scenario
  const axes = await generateDynamicAxes(scenario);
  
  // Generate ideal response for this scenario
  const idealResponse = await generateIdealResponse(scenario, axes);
  
  currentScenario = {
    id: Date.now(),
    text: scenario,
    axes: axes,
    idealResponse: idealResponse,
    startTime: Date.now(),
    duration: ROUND_DURATIONS[currentRound],
    responses: new Map(),
    teamVote: { axis1: 0, axis2: 0 } // Track real-time team average
  };
  
  scenarioStartTime = Date.now();
  
  // Broadcast scenario to all players
  io.emit('scenario:new', currentScenario);
  
  // Set timer for scenario end
  if (scenarioTimer) clearTimeout(scenarioTimer);
  scenarioTimer = setTimeout(() => {
    endCurrentScenario();
  }, ROUND_DURATIONS[currentRound]);
  
  console.log('New scenario started:', scenario);
  console.log('Dynamic axes:', axes);
  console.log('Ideal response:', idealResponse);
}

// End current scenario
function endCurrentScenario() {
  if (currentScenario) {
    // Calculate team response (average position of all players)
    const activePlayers = Array.from(players.values());
    let teamAxis1 = 0;
    let teamAxis2 = 0;
    let playerCount = 0;
    
    activePlayers.forEach(player => {
      // Convert screen coordinates to emotional values
      const centerX = 800; // Assuming 800px width, should be dynamic
      const centerY = 600; // Assuming 600px height, should be dynamic
      const margin = 60;
      const mapWidth = 800 - (margin * 2);
      const mapHeight = 600 - (margin * 2);
      
      const axis1 = -((player.x - centerX/2) / (mapWidth / 2));
      const axis2 = ((player.y - centerY/2) / (mapHeight / 2));
      
      teamAxis1 += Math.max(-1, Math.min(1, axis1));
      teamAxis2 += Math.max(-1, Math.min(1, axis2));
      playerCount++;
    });
    
    if (playerCount > 0) {
      teamAxis1 /= playerCount;
      teamAxis2 /= playerCount;
    }
    
    // Use LLM-generated ideal response
    const idealAxis1 = currentScenario.idealResponse.axis1;
    const idealAxis2 = currentScenario.idealResponse.axis2;
    
    // Calculate accuracy (distance from ideal)
    const distance = Math.sqrt(
      Math.pow(teamAxis1 - idealAxis1, 2) + 
      Math.pow(teamAxis2 - idealAxis2, 2)
    );
    const accuracy = Math.max(0, 100 - (distance * 50)); // 0-100 score
    
    // Update game state based on team response
    const responseStrength = Math.sqrt(teamAxis1 * teamAxis1 + teamAxis2 * teamAxis2);
    
    // Dynamic scoring based on axes (this is a simplified version - could be more sophisticated)
    if (teamAxis1 > 0.3) {
      gameState.socialReputation += 5;
    } else if (teamAxis1 < -0.3) {
      gameState.socialReputation -= 3;
    }
    
    if (teamAxis2 > 0.3) {
      gameState.mentalStability += 5;
      gameState.chaos -= 3;
    } else if (teamAxis2 < -0.3) {
      gameState.mentalStability -= 3;
      gameState.chaos += 5;
    }
    
    // Store team response for final scoring
    gameState.teamResponses.push({
      round: currentRound + 1,
      scenario: currentScenario.text,
      axes: currentScenario.axes,
      teamAxis1,
      teamAxis2,
      idealAxis1,
      idealAxis2,
      accuracy,
      responseCount: currentScenario.responses.size,
      idealReasoning: currentScenario.idealResponse.reasoning
    });
    
    io.emit('scenario:end', {
      scenarioId: currentScenario.id,
      responses: Array.from(currentScenario.responses.entries()),
      teamResponse: { axis1: teamAxis1, axis2: teamAxis2 },
      idealResponse: { axis1: idealAxis1, axis2: idealAxis2 },
      idealReasoning: currentScenario.idealResponse.reasoning,
      axes: currentScenario.axes,
      accuracy: accuracy,
      gameState: {
        mentalStability: Math.max(0, Math.min(100, gameState.mentalStability)),
        socialReputation: Math.max(0, Math.min(100, gameState.socialReputation)),
        chaos: Math.max(0, Math.min(100, gameState.chaos))
      },
      round: currentRound + 1,
      totalRounds: MAX_ROUNDS
    });
    
    console.log(`Scenario ended. Team: (${teamAxis1.toFixed(2)}, ${teamAxis2.toFixed(2)}), Ideal: (${idealAxis1.toFixed(2)}, ${idealAxis2.toFixed(2)}), Accuracy: ${accuracy.toFixed(1)}%`);
    
    currentScenario = null;
    currentRound++;
    
    // Check if game is complete
    if (currentRound >= MAX_ROUNDS) {
      const finalScore = gameState.teamResponses.reduce((sum, r) => sum + r.accuracy, 0) / MAX_ROUNDS;
      io.emit('game:complete', {
        finalScore: finalScore,
        gameState: gameState,
        responses: gameState.teamResponses
      });
      
      // Reset for next game
      currentRound = 0;
      gameState.mentalStability = 50;
      gameState.socialReputation = 50;
      gameState.chaos = 50;
      gameState.teamResponses = [];
      
      console.log(`Game complete! Final score: ${finalScore.toFixed(1)}%`);
      return;
    }
  }
  
  // Schedule next scenario if game continues
  setTimeout(startNewScenario, SCENARIO_INTERVAL - ROUND_DURATIONS[Math.min(currentRound, MAX_ROUNDS - 1)]);
}

// Update team voting average in real-time
function updateTeamVote() {
  if (!currentScenario) return;
  
  const activePlayers = Array.from(players.values());
  let teamAxis1 = 0;
  let teamAxis2 = 0;
  let playerCount = 0;
  
  console.log(`Updating team vote for ${activePlayers.length} players`);
  
  activePlayers.forEach(player => {
    // Use player's screen dimensions if available, fallback to defaults
    const gameWidth = player.gameWidth || 1200;
    const gameHeight = player.gameHeight || 800;
    
    // Convert screen coordinates to emotional values
    const centerX = gameWidth / 2;
    const centerY = gameHeight / 2;
    const margin = 60;
    const mapWidth = gameWidth - (margin * 2);
    const mapHeight = gameHeight - (margin * 2);
    
    const axis1 = -((player.x - centerX) / (mapWidth / 2));
    const axis2 = ((player.y - centerY) / (mapHeight / 2));
    
    console.log(`Player ${player.name}: pos(${player.x}, ${player.y}) -> axes(${axis1.toFixed(2)}, ${axis2.toFixed(2)}) [dims: ${gameWidth}x${gameHeight}]`);
    
    teamAxis1 += Math.max(-1, Math.min(1, axis1));
    teamAxis2 += Math.max(-1, Math.min(1, axis2));
    playerCount++;
  });
  
  if (playerCount > 0) {
    teamAxis1 /= playerCount;
    teamAxis2 /= playerCount;
  }
  
  console.log(`Team average: (${teamAxis1.toFixed(2)}, ${teamAxis2.toFixed(2)})`);
  
  // Update current scenario's team vote
  currentScenario.teamVote = { axis1: teamAxis1, axis2: teamAxis2 };
  
  // Broadcast real-time team vote to all players
  io.emit('team:vote_update', {
    teamVote: currentScenario.teamVote,
    axes: currentScenario.axes,
    playerCount: playerCount
  });
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Send current scenario to new player if one is active
  if (currentScenario) {
    const timeLeft = Math.max(0, ROUND_DURATIONS[currentRound] - (Date.now() - scenarioStartTime));
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
      gameWidth: playerData.gameWidth || 1200,
      gameHeight: playerData.gameHeight || 800
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
      
      // Update team vote in real-time during scenario
      updateTeamVote();
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