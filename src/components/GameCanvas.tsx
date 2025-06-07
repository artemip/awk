'use client';

import { useEffect, useRef, useState } from 'react';
import * as Phaser from 'phaser';
import { initializeSocket, socketEvents, disconnectSocket } from '../lib/socket';

interface Player {
  playerId: string;
  role: string;
  name: string;
}

interface GameCanvasProps {
  player: Player | null;
}

interface GamePlayer {
  id: string;
  name: string;
  role: string;
  x: number;
  y: number;
  color: number;
}

type Point = { x: number; y: number };
type Zone = { 
  id: string; 
  name: string; 
  polygon: Point[];
  color: number;
  tint: number;
};

// Define the six consciousness zones (will be scaled to screen size)
const zones: Zone[] = [
  {
    id: 'logic',
    name: 'Logic',
    polygon: [
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
      { x: 0.4375, y: 0.33 },
      { x: 0.25, y: 0.42 },
      { x: 0, y: 0.33 }
    ],
    color: 0x00ff00,
    tint: 0x90EE90 // Light green
  },
  {
    id: 'emotion',
    name: 'Emotion',
    polygon: [
      { x: 0.5, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 0.33 },
      { x: 0.75, y: 0.42 },
      { x: 0.5625, y: 0.33 },
      { x: 0.4375, y: 0.33 }
    ],
    color: 0xff0080,
    tint: 0xFFB6C1 // Light pink
  },
  {
    id: 'memory',
    name: 'Memory',
    polygon: [
      { x: 1, y: 0.33 },
      { x: 1, y: 0.67 },
      { x: 0.75, y: 0.58 },
      { x: 0.5625, y: 0.67 },
      { x: 0.75, y: 0.42 }
    ],
    color: 0x0080ff,
    tint: 0x87CEEB // Sky blue
  },
  {
    id: 'impulse',
    name: 'Impulse',
    polygon: [
      { x: 1, y: 0.67 },
      { x: 1, y: 1 },
      { x: 0.5, y: 1 },
      { x: 0.4375, y: 0.67 },
      { x: 0.5625, y: 0.67 },
      { x: 0.75, y: 0.58 }
    ],
    color: 0xff8000,
    tint: 0xFFDAAB // Peach
  },
  {
    id: 'anxiety',
    name: 'Anxiety',
    polygon: [
      { x: 0.5, y: 1 },
      { x: 0, y: 1 },
      { x: 0, y: 0.67 },
      { x: 0.25, y: 0.58 },
      { x: 0.4375, y: 0.67 }
    ],
    color: 0x8000ff,
    tint: 0xDDA0DD // Plum
  },
  {
    id: 'instinct',
    name: 'Instinct',
    polygon: [
      { x: 0, y: 0.67 },
      { x: 0, y: 0.33 },
      { x: 0.25, y: 0.42 },
      { x: 0.4375, y: 0.33 },
      { x: 0.5625, y: 0.33 },
      { x: 0.5625, y: 0.67 },
      { x: 0.4375, y: 0.67 },
      { x: 0.25, y: 0.58 }
    ],
    color: 0xff0000,
    tint: 0xFFA07A // Light salmon
  }
];

const ROLE_COLORS: Record<string, number> = {
  Logic: 0x00ff00,     // Green
  Emotion: 0xff0080,   // Pink
  Memory: 0x0080ff,    // Blue
  Impulse: 0xff8000,   // Orange
  Anxiety: 0x8000ff,   // Purple
  Instinct: 0xff0000,  // Red
};

class GameScene extends Phaser.Scene {
  private players: Map<string, Phaser.GameObjects.Arc> = new Map();
  private gameData: Map<string, GamePlayer> = new Map();
  private currentPlayer: Player | null = null;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private socket: any = null;
  private lastMoveTime: number = 0;
  private moveInterval: number = 16; // ~60 FPS movement updates (was 50ms)
  private gameWidth: number = 0;
  private gameHeight: number = 0;

  // Scenario UI elements
  private scenarioUI: {
    container?: Phaser.GameObjects.Container;
    background?: Phaser.GameObjects.Rectangle;
    text?: Phaser.GameObjects.Text;
    timer?: Phaser.GameObjects.Text;
    responseCount?: Phaser.GameObjects.Text;
  } = {};
  private currentScenario: any = null;
  private scenarioEndTime: number = 0;

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: { player: Player }) {
    this.currentPlayer = data.player;
  }

  preload() {
    // No assets needed for simple circles
  }

  async create() {
    // Get screen dimensions
    this.gameWidth = this.cameras.main.width;
    this.gameHeight = this.cameras.main.height;

    // Set up socket connection
    this.socket = await initializeSocket();
    this.socket.connect();

    // Add background
    this.add.rectangle(this.gameWidth / 2, this.gameHeight / 2, this.gameWidth, this.gameHeight, 0x0a0a0a);
    
    // Create zones first (behind everything)
    this.createZones();
    
    // Add grid
    this.createGrid();

    // Set up input after the scene is fully created
    this.setupInput();

    // Socket event listeners
    this.socket.on(socketEvents.CONNECT, () => {
      console.log('Connected to server');
      if (this.currentPlayer) {
        this.socket.emit(socketEvents.PLAYER_JOIN, {
          playerId: this.currentPlayer.playerId,
          name: this.currentPlayer.name,
          role: this.currentPlayer.role,
          x: this.gameWidth / 2,
          y: this.gameHeight / 2
        });
      }
    });

    this.socket.on(socketEvents.PLAYER_UPDATE, (players: GamePlayer[]) => {
      this.updatePlayers(players);
    });

    this.socket.on(socketEvents.PLAYER_LEAVE, (playerId: string) => {
      this.removePlayer(playerId);
    });

    this.socket.on(socketEvents.DISCONNECT, () => {
      console.log('Disconnected from server');
    });

    // Scenario event listeners
    this.socket.on('scenario:new', (scenario: any) => {
      this.handleNewScenario(scenario);
    });

    this.socket.on('scenario:current', (scenario: any) => {
      this.handleCurrentScenario(scenario);
    });

    this.socket.on('scenario:end', (data: any) => {
      this.handleScenarioEnd(data);
    });

    this.socket.on('scenario:response_count', (count: number) => {
      this.updateResponseCount(count);
    });

    // Create scenario UI
    this.createScenarioUI();
  }

  setupInput() {
    // Ensure keyboard plugin is available
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
    } else {
      // Fallback: wait for next frame and try again
      this.time.delayedCall(100, () => {
        if (this.input.keyboard) {
          this.cursors = this.input.keyboard.createCursorKeys();
        }
      });
    }
  }

  createGrid() {
    const graphics = this.add.graphics();
    graphics.lineStyle(1, 0x333333, 0.3);
    
    const gridSize = 40;
    
    // Vertical lines
    for (let x = 0; x <= this.gameWidth; x += gridSize) {
      graphics.moveTo(x, 0);
      graphics.lineTo(x, this.gameHeight);
    }
    
    // Horizontal lines
    for (let y = 0; y <= this.gameHeight; y += gridSize) {
      graphics.moveTo(0, y);
      graphics.lineTo(this.gameWidth, y);
    }
    
    graphics.strokePath();
  }

  createZones() {
    zones.forEach(zone => {
      // Create zone fill
      const graphics = this.add.graphics();
      graphics.fillStyle(zone.tint, 0.3); // 30% opacity for subtle tint
      graphics.lineStyle(2, zone.color, 0.6);
      
      // Scale normalized coordinates to screen dimensions
      const scaledPolygon = zone.polygon.map(point => ({
        x: point.x * this.gameWidth,
        y: point.y * this.gameHeight
      }));
      
      // Draw the polygon
      graphics.beginPath();
      graphics.moveTo(scaledPolygon[0].x, scaledPolygon[0].y);
      
      for (let i = 1; i < scaledPolygon.length; i++) {
        graphics.lineTo(scaledPolygon[i].x, scaledPolygon[i].y);
      }
      
      graphics.closePath();
      graphics.fillPath();
      graphics.strokePath();
      
      // Add zone label at center
      const centerX = scaledPolygon.reduce((sum, p) => sum + p.x, 0) / scaledPolygon.length;
      const centerY = scaledPolygon.reduce((sum, p) => sum + p.y, 0) / scaledPolygon.length;
      
      const label = this.add.text(centerX, centerY, zone.name, {
        fontSize: '18px',
        color: `#${zone.color.toString(16).padStart(6, '0')}`,
        align: 'center',
        fontStyle: 'bold'
      });
      label.setOrigin(0.5);
      label.setAlpha(0.7);
    });
  }

  // Helper function to detect which zone a point is in
  getZoneAtPosition(x: number, y: number): Zone | null {
    // Convert to normalized coordinates
    const normalizedX = x / this.gameWidth;
    const normalizedY = y / this.gameHeight;
    
    for (const zone of zones) {
      if (this.isPointInPolygon({ x: normalizedX, y: normalizedY }, zone.polygon)) {
        return zone;
      }
    }
    return null;
  }

  // Point-in-polygon algorithm
  isPointInPolygon(point: Point, polygon: Point[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      if (((polygon[i].y > point.y) !== (polygon[j].y > point.y)) &&
          (point.x < (polygon[j].x - polygon[i].x) * (point.y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x)) {
        inside = !inside;
      }
    }
    return inside;
  }

  update() {
    if (!this.cursors || !this.currentPlayer || !this.socket) return;

    // Update scenario timer
    if (this.currentScenario && this.scenarioEndTime > 0) {
      const timeLeft = Math.max(0, this.scenarioEndTime - Date.now());
      const secondsLeft = Math.ceil(timeLeft / 1000);
      
      if (this.scenarioUI.timer) {
        if (secondsLeft > 0) {
          this.scenarioUI.timer.setText(`Time: ${secondsLeft}s`);
          // Color changes based on urgency
          if (secondsLeft <= 5) {
            this.scenarioUI.timer.setColor('#ff0000'); // Red for last 5 seconds
          } else if (secondsLeft <= 10) {
            this.scenarioUI.timer.setColor('#ff8000'); // Orange for last 10 seconds
          } else {
            this.scenarioUI.timer.setColor('#ffff00'); // Yellow otherwise
          }
        } else {
          this.scenarioUI.timer.setText('Time\'s up!');
          this.scenarioUI.timer.setColor('#ff0000');
        }
      }
    }

    // Movement logic
    const now = Date.now();
    if (now - this.lastMoveTime < this.moveInterval) return;

    let moved = false;
    const currentPlayerData = this.gameData.get(this.currentPlayer.playerId);
    if (!currentPlayerData) return;

    let newX = currentPlayerData.x;
    let newY = currentPlayerData.y;
    const speed = 8; // Increased from 5 for faster movement

    if (this.cursors.left.isDown) {
      newX = Math.max(20, newX - speed);
      moved = true;
    }
    if (this.cursors.right.isDown) {
      newX = Math.min(this.gameWidth - 20, newX + speed);
      moved = true;
    }
    if (this.cursors.up.isDown) {
      newY = Math.max(20, newY - speed);
      moved = true;
    }
    if (this.cursors.down.isDown) {
      newY = Math.min(this.gameHeight - 20, newY + speed);
      moved = true;
    }

    if (moved) {
      this.socket.emit(socketEvents.PLAYER_UPDATE, {
        playerId: this.currentPlayer.playerId,
        x: newX,
        y: newY
      });
      this.lastMoveTime = now;
    }
  }

  updatePlayers(players: GamePlayer[]) {
    // Update game data
    players.forEach(player => {
      this.gameData.set(player.id, player);
    });

    // Update visual representations
    players.forEach(player => {
      let neuron = this.players.get(player.id);
      
      if (!neuron) {
        // Create new neuron
        const color = ROLE_COLORS[player.role] || 0xffffff;
        neuron = this.add.circle(player.x, player.y, 15, color);
        neuron.setStrokeStyle(2, 0xffffff);
        this.players.set(player.id, neuron);

        // Add name label
        const nameText = this.add.text(player.x, player.y - 35, player.name, {
          fontSize: '12px',
          color: '#ffffff',
          align: 'center'
        });
        nameText.setOrigin(0.5);
        
        // Store text reference on neuron for updates
        (neuron as any).nameText = nameText;
      } else {
        // Update position
        neuron.setPosition(player.x, player.y);
        if ((neuron as any).nameText) {
          (neuron as any).nameText.setPosition(player.x, player.y - 35);
        }
      }

      // Check if player is in their matching zone
      const currentZone = this.getZoneAtPosition(player.x, player.y);
      const isInMatchingZone = currentZone && currentZone.name === player.role;

      // Enhanced visual feedback for players in their matching zone
      if (isInMatchingZone) {
        neuron.setStrokeStyle(4, 0xffffff, 1); // Thicker white border
        neuron.setScale(1.2); // Slightly larger
        if ((neuron as any).nameText) {
          (neuron as any).nameText.setStyle({ 
            color: '#ffff00',
            fontSize: '14px',
            fontStyle: 'bold'
          });
        }
      } else {
        neuron.setScale(1.0); // Normal size
        neuron.setStrokeStyle(2, 0xffffff);
        if ((neuron as any).nameText) {
          (neuron as any).nameText.setStyle({ 
            color: '#ffffff',
            fontSize: '12px',
            fontStyle: 'normal'
          });
        }
      }

      // Highlight current player
      if (this.currentPlayer && player.id === this.currentPlayer.playerId) {
        neuron.setStrokeStyle(3, 0xffffff);
        if ((neuron as any).nameText) {
          (neuron as any).nameText.setStyle({ color: '#ffff00' });
        }
      }
    });

    // Remove players that are no longer in the game
    this.players.forEach((neuron, playerId) => {
      if (!players.find(p => p.id === playerId)) {
        this.removePlayer(playerId);
      }
    });
  }

  removePlayer(playerId: string) {
    const neuron = this.players.get(playerId);
    if (neuron) {
      if ((neuron as any).nameText) {
        (neuron as any).nameText.destroy();
      }
      neuron.destroy();
      this.players.delete(playerId);
    }
    this.gameData.delete(playerId);
  }

  // Scenario UI Management
  createScenarioUI() {
    // Create scenario container (initially hidden)
    this.scenarioUI.container = this.add.container(this.gameWidth / 2, 80);
    this.scenarioUI.container.setVisible(false);

    // Background
    this.scenarioUI.background = this.add.rectangle(0, 0, this.gameWidth * 0.95, 120, 0x000000, 0.9);
    this.scenarioUI.background.setStrokeStyle(2, 0xffffff, 0.8);
    this.scenarioUI.container.add(this.scenarioUI.background);

    // Scenario text
    this.scenarioUI.text = this.add.text(0, -20, '', {
      fontSize: '18px',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: this.gameWidth * 0.9 }
    });
    this.scenarioUI.text.setOrigin(0.5);
    this.scenarioUI.container.add(this.scenarioUI.text);

    // Timer
    this.scenarioUI.timer = this.add.text(0, 25, '', {
      fontSize: '20px',
      color: '#ffff00',
      align: 'center',
      fontStyle: 'bold'
    });
    this.scenarioUI.timer.setOrigin(0.5);
    this.scenarioUI.container.add(this.scenarioUI.timer);

    // Response count
    this.scenarioUI.responseCount = this.add.text(0, 45, '', {
      fontSize: '12px',
      color: '#00ff00',
      align: 'center'
    });
    this.scenarioUI.responseCount.setOrigin(0.5);
    this.scenarioUI.container.add(this.scenarioUI.responseCount);
  }

  handleNewScenario(scenario: any) {
    this.currentScenario = scenario;
    this.scenarioEndTime = Date.now() + scenario.duration;
    
    if (this.scenarioUI.text) {
      this.scenarioUI.text.setText(scenario.text);
    }
    
    if (this.scenarioUI.container) {
      this.scenarioUI.container.setVisible(true);
    }
    
    this.updateResponseCount(0);
    console.log('New scenario:', scenario.text);
  }

  handleCurrentScenario(scenario: any) {
    if (scenario.timeLeft > 0) {
      this.currentScenario = scenario;
      this.scenarioEndTime = Date.now() + scenario.timeLeft;
      
      if (this.scenarioUI.text) {
        this.scenarioUI.text.setText(scenario.text);
      }
      
      if (this.scenarioUI.container) {
        this.scenarioUI.container.setVisible(true);
      }
    }
  }

  handleScenarioEnd(data: any) {
    console.log('Scenario ended with', data.responses.length, 'responses');
    
    if (this.scenarioUI.container) {
      this.scenarioUI.container.setVisible(false);
    }
    
    this.currentScenario = null;
    this.scenarioEndTime = 0;
  }

  updateResponseCount(count: number) {
    if (this.scenarioUI.responseCount) {
      this.scenarioUI.responseCount.setText(`Responses: ${count}`);
    }
  }
}

export default function GameCanvas({ player }: GameCanvasProps) {
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentScenario, setCurrentScenario] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [responseCount, setResponseCount] = useState<number>(0);
  const [hasResponded, setHasResponded] = useState<boolean>(false);
  const [response, setResponse] = useState<string>('');

  // Socket connection for scenario updates
  useEffect(() => {
    if (!player) return;

    const setupScenarioListeners = async () => {
      const { initializeSocket, socketEvents } = await import('../lib/socket');
      const socket = await initializeSocket();
      
      socket.on('scenario:new', (scenario: any) => {
        setCurrentScenario(scenario);
        setTimeLeft(scenario.duration / 1000);
        setHasResponded(false);
        setResponse('');
        setResponseCount(0);
      });

      socket.on('scenario:current', (scenario: any) => {
        if (scenario.timeLeft > 0) {
          setCurrentScenario(scenario);
          setTimeLeft(Math.ceil(scenario.timeLeft / 1000));
          setHasResponded(false);
          setResponse('');
        }
      });

      socket.on('scenario:end', () => {
        setCurrentScenario(null);
        setTimeLeft(0);
        setHasResponded(false);
        setResponse('');
      });

      socket.on('scenario:response_count', (count: number) => {
        setResponseCount(count);
      });

      return socket;
    };

    setupScenarioListeners();
  }, [player]);

  // Timer countdown
  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => {
        setTimeLeft(timeLeft - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [timeLeft]);

  const handleResponseSubmit = async () => {
    if (!response.trim() || hasResponded || !currentScenario) return;
    
    const { getSocket } = await import('../lib/socket');
    const socket = getSocket();
    
    if (socket) {
      socket.emit('scenario:respond', { response: response.trim() });
      setHasResponded(true);
    }
  };

  useEffect(() => {
    if (!containerRef.current || !player) return;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: '100%',
      height: '100vh',
      parent: containerRef.current,
      backgroundColor: '#000000',
      scene: GameScene,
      antialias: false,
      pixelArt: true,
      roundPixels: true,
      input: {
        keyboard: true
      },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: '100%',
        height: '100%'
      },
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { y: 0, x: 0 },
          debug: false
        }
      }
    };

    gameRef.current = new Phaser.Game(config);
    gameRef.current.scene.start('GameScene', { player });

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
      disconnectSocket();
    };
  }, [player]);

  return (
    <div className="w-full space-y-4">
      <div 
        ref={containerRef} 
        className="w-full h-screen bg-black"
      />
      
      {/* Scenario Response UI */}
      {currentScenario && (
        <div className="w-full max-w-4xl mx-auto bg-gray-900 rounded-lg p-4 border border-gray-700">
          <div className="text-center mb-4">
            <h3 className="text-lg font-bold text-white mb-2">Neural Network Scenario</h3>
            <p className="text-gray-300 mb-3">{currentScenario.text}</p>
            <div className="flex justify-center items-center space-x-4">
              <div className={`text-lg font-bold ${
                timeLeft <= 5 ? 'text-red-400' : 
                timeLeft <= 10 ? 'text-orange-400' : 'text-yellow-400'
              }`}>
                {timeLeft > 0 ? `${timeLeft}s remaining` : "Time's up!"}
              </div>
              <div className="text-green-400 text-sm">
                {responseCount} responses submitted
              </div>
            </div>
          </div>
          
          {!hasResponded && timeLeft > 0 && (
            <div className="space-y-3">
              <textarea
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                placeholder={`How does ${player?.role} respond to this scenario?`}
                className="w-full p-3 bg-gray-800 text-white border border-gray-600 rounded-lg resize-none focus:outline-none focus:border-blue-500"
                rows={3}
                maxLength={200}
              />
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">
                  {response.length}/200 characters
                </span>
                <button
                  onClick={handleResponseSubmit}
                  disabled={!response.trim()}
                  className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                    response.trim() 
                      ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                      : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  Submit Response
                </button>
              </div>
            </div>
          )}
          
          {hasResponded && (
            <div className="text-center py-4">
              <div className="text-green-400 font-medium">✓ Response submitted!</div>
              <div className="text-gray-400 text-sm mt-1">
                Waiting for other players or timer to end...
              </div>
            </div>
          )}
          
          {timeLeft === 0 && !hasResponded && (
            <div className="text-center py-4">
              <div className="text-red-400 font-medium">⏰ Time&apos;s up!</div>
              <div className="text-gray-400 text-sm mt-1">
                You didn&apos;t submit a response in time.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 