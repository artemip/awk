'use client';

import { useEffect, useRef } from 'react';
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private socket: any = null;
  private lastMoveTime: number = 0;
  private moveInterval: number = 50; // 20 FPS movement updates

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
    // Set up socket connection
    this.socket = await initializeSocket();
    this.socket.connect();

    // Add background
    this.add.rectangle(400, 300, 800, 600, 0x0a0a0a);
    
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
          x: 400,
          y: 300
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
    
    // Vertical lines
    for (let x = 0; x <= 800; x += 40) {
      graphics.moveTo(x, 0);
      graphics.lineTo(x, 600);
    }
    
    // Horizontal lines
    for (let y = 0; y <= 600; y += 40) {
      graphics.moveTo(0, y);
      graphics.lineTo(800, y);
    }
    
    graphics.strokePath();
  }

  update() {
    if (!this.cursors || !this.currentPlayer || !this.socket) return;

    const now = Date.now();
    if (now - this.lastMoveTime < this.moveInterval) return;

    let moved = false;
    const currentPlayerData = this.gameData.get(this.currentPlayer.playerId);
    if (!currentPlayerData) return;

    let newX = currentPlayerData.x;
    let newY = currentPlayerData.y;
    const speed = 5;

    if (this.cursors.left.isDown) {
      newX = Math.max(20, newX - speed);
      moved = true;
    }
    if (this.cursors.right.isDown) {
      newX = Math.min(780, newX + speed);
      moved = true;
    }
    if (this.cursors.up.isDown) {
      newY = Math.max(20, newY - speed);
      moved = true;
    }
    if (this.cursors.down.isDown) {
      newY = Math.min(580, newY + speed);
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (neuron as any).nameText = nameText;
      } else {
        // Update position
        neuron.setPosition(player.x, player.y);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((neuron as any).nameText) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (neuron as any).nameText.setPosition(player.x, player.y - 35);
        }
      }

      // Highlight current player
      if (this.currentPlayer && player.id === this.currentPlayer.playerId) {
        neuron.setStrokeStyle(3, 0xffffff);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((neuron as any).nameText) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((neuron as any).nameText) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (neuron as any).nameText.destroy();
      }
      neuron.destroy();
      this.players.delete(playerId);
    }
    this.gameData.delete(playerId);
  }
}

export default function GameCanvas({ player }: GameCanvasProps) {
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !player) return;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      parent: containerRef.current,
      backgroundColor: '#000000',
      scene: GameScene,
      input: {
        keyboard: true
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
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
    <div 
      ref={containerRef} 
      className="w-full flex justify-center items-center bg-black rounded-lg"
      style={{ minHeight: '600px' }}
    />
  );
} 