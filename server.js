const { createServer } = require('http');
const { Server } = require('socket.io');

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:3002", "http://127.0.0.1:3000", "http://127.0.0.1:3002"],
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
  const prompt = `You are generating an awkward, emotionally charged life situation for "The Hive Mind: Party Brain Edition" game.

  Active neural roles: ${roles.join(', ')}

  Create a concise, relatable scenario (2 sentences max) that puts someone in an uncomfortable social situation requiring immediate emotional response. The scenario should include:
  - Clear context and stakes
  - Awkward or emotionally charged elements
  - Something people can relate to
  - Requires choosing between approach vs avoidance AND vindictive vs empathetic responses

  Examples:
  - "You're at your reunion when your ex approaches with their new partner. They loudly announce that you 'inspired them to find real love' and everyone are watching your reaction."
  - "During a work video call, you realize you've been muted for 5 minutes while arguing. Your colleagues look embarrassed and your boss asks you to repeat everything."
  - "You're at a dinner party when the host serves a dish you're allergic to. They keep emphasizing how special the family recipe is while watching you expectantly."

  Respond with just the scenario text, no additional formatting.`;

  try {
    const response = await fetch('http://localhost:3000/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, requestType: 'scenario' })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('LLM scenario generated successfully');
      return data.response.trim();
    } else {
      console.error('LLM API response not ok:', response.status, response.statusText);
      throw new Error(`LLM API error: ${response.status}`);
    }
  } catch (error) {
    console.error('Failed to generate scenario:', error);
    throw error;
  }
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
    const response = await fetch('http://localhost:3000/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, requestType: 'axes' })
    });
    
    if (response.ok) {
      const data = await response.json();
      try {
        const axes = JSON.parse(data.response.trim());
        console.log('LLM axes generated successfully:', axes);
        return axes;
      } catch (parseError) {
        console.error('Failed to parse axes JSON:', parseError);
        throw new Error('Invalid JSON response for axes');
      }
    } else {
      console.error('LLM API response not ok for axes:', response.status, response.statusText);
      throw new Error(`LLM API error for axes: ${response.status}`);
    }
  } catch (error) {
    console.error('Failed to generate dynamic axes:', error);
    throw error;
  }
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
  "ideal_action": "brief 3-5 word action you should take"
}

Example: If the ideal response is moderately empathetic and slightly avoidant, you might return:
{"axis1_value": -0.3, "axis2_value": 0.6, "ideal_action": "Step back with compassion"}`;

  try {
    const response = await fetch('http://localhost:3000/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, requestType: 'ideal' })
    });
    
    if (response.ok) {
      const data = await response.json();
      try {
        console.log('Raw LLM response for ideal:', data.response);
        const ideal = JSON.parse(data.response.trim());
        const result = {
          axis1: Math.max(-1, Math.min(1, ideal.axis1_value)),
          axis2: Math.max(-1, Math.min(1, ideal.axis2_value)),
          idealAction: ideal.ideal_action
        };
        console.log('LLM ideal response generated successfully:', result);
        return result;
      } catch (parseError) {
        console.error('Failed to parse ideal response JSON:', parseError);
        console.error('Raw response was:', data.response);
        throw new Error('Invalid JSON response for ideal');
      }
    } else {
      console.error('LLM API response not ok for ideal:', response.status, response.statusText);
      throw new Error(`LLM API error for ideal: ${response.status}`);
    }
  } catch (error) {
    console.error('Failed to generate ideal response:', error);
    throw error;
  }
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
    idealAction: "Randomly generated fallback"
  };
}

// Start a new scenario
async function startNewScenario() {
  const activePlayers = Array.from(players.values());
  if (activePlayers.length === 0) return;
  
  // Emit loading state to all players
  io.emit('scenario:loading');
  console.log('Starting LLM scenario generation...');
  
  let scenario, axes, idealResponse;
  let usedFallback = false;
  
  try {
    // Generate scenario with timeout
    scenario = await Promise.race([
      generatePartyBrainScenario(activePlayers),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Scenario timeout')), 15000))
    ]);
    
    // Generate dynamic axes with timeout
    axes = await Promise.race([
      generateDynamicAxes(scenario),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Axes timeout')), 15000))
    ]);
    
    // Generate ideal response with timeout  
    idealResponse = await Promise.race([
      generateIdealResponse(scenario, axes),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Ideal timeout')), 15000))
    ]);
    
  } catch (error) {
    console.log('LLM generation failed or timed out, using fallbacks:', error.message);
    usedFallback = true;
    
    // Use fallbacks only after timeout
    if (!scenario || scenario.includes('fallback')) {
      const fallbackScenarios = [
        "You're at your reunion when your ex approaches with their new partner. They loudly announce that you 'inspired them to find real love' and everyone is watching your reaction.",
        "During a work video call, you realize you've been muted for 5 minutes while arguing. Your colleagues look embarrassed and your boss asks you to repeat everything.",
        "You're at a dinner party when the host serves a dish you're allergic to. They keep emphasizing how special the family recipe is while watching you expectantly.",
        "Your Uber driver starts crying about their divorce and asks for your advice. They want to know if they should fight for custody.",
        "You accidentally send a screenshot of someone's complaint text to that same person. They respond immediately asking 'What is this?'",
        "Your boss frames working weekends as 'a great growth opportunity' while making it clear it's not optional. Your coworker who refuses overtime is standing right there.",
        "You're at dinner when your friend's card gets declined for the third time. The server is impatient and your friend looks mortified.",
        "You walk into the wrong restroom by mistake. Someone inside saw you enter and is staring at you in the mirror."
      ];
      scenario = fallbackScenarios[Math.floor(Math.random() * fallbackScenarios.length)];
    }
    
    if (!axes) {
      axes = getDefaultAxes();
    }
    
    if (!idealResponse) {
      idealResponse = getRandomIdeal();
    }
  }
  
  currentScenario = {
    id: Date.now(),
    text: scenario,
    axes: axes,
    idealResponse: idealResponse,
    startTime: Date.now(),
    duration: ROUND_DURATIONS[currentRound],
    responses: new Map(),
    teamVote: { axis1: 0, axis2: 0 }, // Track real-time team average
    usedFallback: usedFallback
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
  console.log('Used fallback:', usedFallback);
}

// End current scenario
async function endCurrentScenario() {
  if (currentScenario) {
    // Calculate team response (average position of all players)
    const activePlayers = Array.from(players.values());
    let teamAxis1 = 0;
    let teamAxis2 = 0;
    let playerCount = 0;
    
    activePlayers.forEach(player => {
      // Use player's actual screen dimensions
      const gameWidth = player.gameWidth || 1200;
      const gameHeight = player.gameHeight || 800;
      
      // Convert screen coordinates to emotional values
      const centerX = gameWidth / 2;
      const centerY = gameHeight / 2;
      const margin = 60;
      const mapWidth = gameWidth - (margin * 2);
      const mapHeight = gameHeight - (margin * 2);
      
      const axis1 = ((player.x - centerX) / (mapWidth / 2));
      const axis2 = ((player.y - centerY) / (mapHeight / 2));
      
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
      idealAction: currentScenario.idealResponse.idealAction
    });
    
    // Emit loading state for score generation
    io.emit('score:loading');
    console.log('Generating LLM feedback for score display...');
    
    let whatYouShouldHaveDone, whatYouActuallyDid;
    
    try {
      // Generate LLM feedback with timeouts
      whatYouShouldHaveDone = await Promise.race([
        generateWhatYouShouldHaveDone(currentScenario.text, currentScenario.axes, currentScenario.idealResponse),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Should have done timeout')), 10000))
      ]);
      
      whatYouActuallyDid = await Promise.race([
        generateWhatYouActuallyDid(currentScenario.text, currentScenario.axes, { axis1: teamAxis1, axis2: teamAxis2 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Actually did timeout')), 10000))
      ]);
      
    } catch (error) {
      console.log('LLM feedback generation failed or timed out, using fallbacks:', error.message);
      whatYouShouldHaveDone = `The ideal approach would have been ${currentScenario.idealResponse.idealAction.toLowerCase()}.`;
      whatYouActuallyDid = `The team chose a ${teamAxis1 > 0 ? 'more direct' : 'more avoidant'} and ${teamAxis2 > 0 ? 'more empathetic' : 'more harsh'} approach.`;
    }
    
    io.emit('score:display', {
      scenarioId: currentScenario.id,
      scenario: currentScenario.text,
      teamResponse: { axis1: teamAxis1, axis2: teamAxis2 },
      idealResponse: { axis1: idealAxis1, axis2: idealAxis2 },
      idealAction: currentScenario.idealResponse.idealAction,
      whatYouShouldHaveDone,
      whatYouActuallyDid,
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
  
  // Schedule next scenario after 20 seconds (instead of the complex calculation)
  setTimeout(startNewScenario, 20000);
}

// Update team voting average in real-time
function updateTeamVote() {
  const activePlayers = Array.from(players.values());
  let teamAxis1 = 0;
  let teamAxis2 = 0;
  let playerCount = 0;
  
  console.log(`Updating team vote for ${activePlayers.length} players`);
  
  activePlayers.forEach(player => {
    // Use player's actual screen dimensions
    const gameWidth = player.gameWidth || 1200;
    const gameHeight = player.gameHeight || 800;
    
    // Convert screen coordinates to emotional values
    const centerX = gameWidth / 2;
    const centerY = gameHeight / 2;
    const margin = 60;
    const mapWidth = gameWidth - (margin * 2);
    const mapHeight = gameHeight - (margin * 2);
    
    // Fix coordinate system: 
    // axis1: left (-1) to right (+1)
    // axis2: top (-1) to bottom (+1)
    const axis1 = ((player.x - centerX) / (mapWidth / 2));
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
  
  // Update current scenario's team vote if scenario is active
  if (currentScenario) {
    currentScenario.teamVote = { axis1: teamAxis1, axis2: teamAxis2 };
  }
  
  // Always broadcast real-time team vote to all players (even when no scenario)
  io.emit('team:vote_update', {
    teamVote: { axis1: teamAxis1, axis2: teamAxis2 },
    axes: currentScenario ? currentScenario.axes : getDefaultAxes(),
    playerCount: playerCount
  });
}

// Generate feedback about what the team should have done (LLM)
async function generateWhatYouShouldHaveDone(scenario, axes, idealResponse) {
  const prompt = `Given this scenario and the ideal response, explain what the player should have done in 1-2 sentences.

Scenario: "${scenario}"

Axis 1: ${axes.axis1.negative} (-1) ↔ ${axes.axis1.positive} (+1)
Axis 2: ${axes.axis2.negative} (-1) ↔ ${axes.axis2.positive} (+1)

Ideal position: (${idealResponse.axis1.toFixed(2)}, ${idealResponse.axis2.toFixed(2)})
Ideal action: "${idealResponse.idealAction}"

Explain what the ideal response would have looked like in practice. Keep it concise and actionable.

Respond with just the explanation text, no additional formatting.`;

  try {
    const response = await fetch('http://localhost:3000/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, requestType: 'shouldHaveDone' })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('LLM "should have done" generated successfully');
      return data.response.trim();
    } else {
      console.error('LLM API response not ok for should have done:', response.status, response.statusText);
      throw new Error(`LLM API error for should have done: ${response.status}`);
    }
  } catch (error) {
    console.error('Failed to generate what you should have done:', error);
    throw error;
  }
}

// Generate feedback about what the team actually did (LLM)
async function generateWhatYouActuallyDid(scenario, axes, teamResponse) {
  const prompt = `Given this scenario and the team's actual response, describe what the team actually did in 1-2 sentences.

Scenario: "${scenario}"

Axis 1: ${axes.axis1.negative} (-1) ↔ ${axes.axis1.positive} (+1)
Axis 2: ${axes.axis2.negative} (-1) ↔ ${axes.axis2.positive} (+1)

Team's actual position: (${teamResponse.axis1.toFixed(2)}, ${teamResponse.axis2.toFixed(2)})

Interpret this position and describe what kind of response the team chose. Be specific about the emotional stance and approach.

Respond with just the description text, no additional formatting.`;

  try {
    const response = await fetch('http://localhost:3000/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, requestType: 'actuallyDid' })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('LLM "actually did" generated successfully');
      return data.response.trim();
    } else {
      console.error('LLM API response not ok for actually did:', response.status, response.statusText);
      throw new Error(`LLM API error for actually did: ${response.status}`);
    }
  } catch (error) {
    console.error('Failed to generate what you actually did:', error);
    throw error;
  }
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
    
    // Update team vote when new player joins
    updateTeamVote();
    
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
      
      // Update team vote after player leaves
      updateTeamVote();
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
    if (currentScenario) {
      const player = Array.from(players.values()).find(p => p.socketId === socket.id);
      if (player) {
        currentScenario.responses.set(socket.id, {
          playerId: player.id,
          name: player.name,
          role: player.role,
          response: responseData.response,
          timestamp: Date.now()
        });
        
        console.log(`${player.name} (${player.role}) responded: ${responseData.response}`);
        
        // Broadcast response count update
        io.emit('scenario:response_count', currentScenario.responses.size);
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
  console.log(`Ready for up to ${MAX_PLAYERS} players`);
}); 