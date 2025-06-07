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
  
  // UI elements
  private scenarioText: Phaser.GameObjects.Text | null = null;
  private timerText: Phaser.GameObjects.Text | null = null;
  private mentalStabilityMeter: Phaser.GameObjects.Rectangle | null = null;
  private socialReputationMeter: Phaser.GameObjects.Rectangle | null = null;
  private chaosMeter: Phaser.GameObjects.Rectangle | null = null;
  private responseCountText: Phaser.GameObjects.Text | null = null;
  private endGameText: Phaser.GameObjects.Text | null = null;
  
  // Dynamic axes support
  private currentAxes: any = null;
  private axisLabels: Phaser.GameObjects.Text[] = [];
  private teamVoteBar: Phaser.GameObjects.Graphics | null = null;
  private teamVoteIndicator: Phaser.GameObjects.Arc | null = null;
  private miniMapAxisLabels: Phaser.GameObjects.Text[] = [];
  private currentTeamVote: { axis1: number; axis2: number } = { axis1: 0, axis2: 0 };
  
  // Scenario tracking
  private currentScenario: any = null;
  private scenarioEndTime: number = 0;
  private isLoadingScenario: boolean = false;
  private isLoadingScore: boolean = false;
  private currentScore: any = null;
  
  // Legacy UI containers (keeping for compatibility)
  private scenarioUI: {
    container?: Phaser.GameObjects.Container;
    background?: Phaser.GameObjects.Rectangle;
    text?: Phaser.GameObjects.Text;
    timer?: Phaser.GameObjects.Text;
    responseCount?: Phaser.GameObjects.Text;
    loadingText?: Phaser.GameObjects.Text;
  } = {};
  private teamVotingUI: {
    container?: Phaser.GameObjects.Container;
    teamMarker?: Phaser.GameObjects.Arc;
    idealMarker?: Phaser.GameObjects.Arc;
  } = {};
  private scoringUI: {
    container?: Phaser.GameObjects.Container;
    mentalStabilityBar?: Phaser.GameObjects.Rectangle;
    socialReputationBar?: Phaser.GameObjects.Rectangle;
    chaosBar?: Phaser.GameObjects.Rectangle;
  } = {};
  private gameState = {
    mentalStability: 50,
    socialReputation: 50,
    chaos: 50,
    round: 0,
    totalRounds: 4
  };
  private scoreUI: {
    container?: Phaser.GameObjects.Container;
    background?: Phaser.GameObjects.Rectangle;
    miniMap?: Phaser.GameObjects.Graphics;
    teamMarker?: Phaser.GameObjects.Arc;
    idealMarker?: Phaser.GameObjects.Arc;
    whatYouShouldHaveText?: Phaser.GameObjects.Text;
    whatYouActuallyDidText?: Phaser.GameObjects.Text;
    loadingText?: Phaser.GameObjects.Text;
    accuracyText?: Phaser.GameObjects.Text;
    miniMapAxisLabels?: Phaser.GameObjects.Text[];
  } = {};

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: { player: Player }) {
    this.currentPlayer = data.player;
  }

  preload() {
    // No assets needed for simple circles
  }

  create() {
    // Get screen dimensions
    this.gameWidth = this.cameras.main.width;
    this.gameHeight = this.cameras.main.height;

    // Add background that covers full screen
    this.add.rectangle(this.gameWidth / 2, this.gameHeight / 2, this.gameWidth, this.gameHeight, 0x0a0a0a);
    
    // Create coordinate plane (replacing brain zones)
    this.createCoordinatePlane();
    
    // Add grid
    this.createGrid();

    // Set up input after the scene is fully created
    this.setupInput();

    // Set up socket connection after scene is ready
    this.initializeSocketConnection();

    // Create scenario UI
    this.createScenarioUI();
    
    // Create score UI
    this.createScoreUI();
    
    // Create team voting visualization
    this.createTeamVotingUI();

    // Create team voting bar
    this.createTeamVotingBar();
  }

  async initializeSocketConnection() {
    try {
      // Set up socket connection
      this.socket = await initializeSocket();
      this.socket.connect();

      // Socket event listeners
      this.socket.on(socketEvents.CONNECT, () => {
        console.log('Connected to server');
        if (this.currentPlayer) {
          this.socket.emit(socketEvents.PLAYER_JOIN, {
            playerId: this.currentPlayer.playerId,
            name: this.currentPlayer.name,
            role: this.currentPlayer.role,
            x: this.gameWidth / 2,
            y: this.gameHeight / 2,
            gameWidth: this.gameWidth,
            gameHeight: this.gameHeight
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

      this.socket.on('scenario:loading', () => {
        this.handleScenarioLoading();
      });

      this.socket.on('scenario:current', (scenario: any) => {
        this.handleCurrentScenario(scenario);
      });

      this.socket.on('scenario:end', (data: any) => {
        this.handleScenarioEnd(data);
      });

      this.socket.on('score:loading', () => {
        this.handleScoreLoading();
      });

      this.socket.on('score:display', (data: any) => {
        this.handleScoreDisplay(data);
      });

      this.socket.on('scenario:response_count', (count: number) => {
        this.updateResponseCount(count);
      });
      
      this.socket.on('team:vote_update', (data: any) => {
        this.handleTeamVoteUpdate(data);
      });

      this.socket.on('game:complete', (data: any) => {
        this.handleGameComplete(data);
      });
    } catch (error) {
      console.error('Failed to initialize socket connection:', error);
    }
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
    // Grid is now part of createCoordinatePlane(), so this method can be simplified or removed
    // The coordinate plane already includes the grid lines we need
  }

  createCoordinatePlane() {
    // Don't create if scene isn't ready
    if (!this.add) return;
    
    const graphics = this.add.graphics();
    const centerX = this.gameWidth / 2;
    const centerY = this.gameHeight / 2;
    
    // Calculate emotional map dimensions
    const margin = 60;
    const mapWidth = this.gameWidth - (margin * 2);
    const mapHeight = this.gameHeight - (margin * 2);
    const mapLeft = margin;
    const mapTop = margin;
    
    // Create a smooth 4-way gradient covering the entire emotional space
    // This creates a gradient from each corner to the center
    graphics.fillGradientStyle(
      0x3B82F6,  // Top-left: Blue
      0xEF4444,  // Top-right: Red  
      0xF59E0B,  // Bottom-left: Gold
      0x10B981,  // Bottom-right: Green
      0.4        // Alpha
    );
    graphics.fillRect(mapLeft, mapTop, mapWidth, mapHeight);
    
    // Only draw the outer border, no internal lines
    graphics.lineStyle(3, 0xffffff, 0.8);
    graphics.strokeRect(mapLeft, mapTop, mapWidth, mapHeight);
    
    // Create placeholder axis labels (will be updated when scenario starts)
    this.updateAxisLabels();
  }
  
  updateAxisLabels() {
    // Don't update if scene isn't ready
    if (!this.add) return;
    
    // Clear existing labels
    this.axisLabels.forEach(label => label.destroy());
    this.axisLabels = [];
    
    const centerX = this.gameWidth / 2;
    const centerY = this.gameHeight / 2;
    const margin = 60;
    const mapWidth = this.gameWidth - (margin * 2);
    const mapHeight = this.gameHeight - (margin * 2);
    const mapLeft = margin;
    const mapTop = margin;
    
    // Handle loading state - show loading indicators instead of defaults
    if (this.isLoadingScenario && !this.currentAxes) {
      // Show loading indicators in each quadrant
      const loadingText = '🔄\nLoading...';
      const loadingStyle = {
        fontSize: '12px', 
        color: '#888888', 
        fontStyle: 'italic', 
        align: 'center'
      };
      
      const topLeft = this.add.text(mapLeft + mapWidth * 0.25, mapTop + mapHeight * 0.25, 
        loadingText, loadingStyle).setOrigin(0.5);
      
      const topRight = this.add.text(centerX + mapWidth * 0.25, mapTop + mapHeight * 0.25, 
        loadingText, loadingStyle).setOrigin(0.5);
      
      const bottomLeft = this.add.text(mapLeft + mapWidth * 0.25, centerY + mapHeight * 0.25, 
        loadingText, loadingStyle).setOrigin(0.5);
      
      const bottomRight = this.add.text(centerX + mapWidth * 0.25, centerY + mapHeight * 0.25, 
        loadingText, loadingStyle).setOrigin(0.5);
      
      this.axisLabels = [topLeft, topRight, bottomLeft, bottomRight];
      return;
    }
    
    // Use current axes or defaults (only when not loading)
    const axes = this.currentAxes || {
      axis1: { negative: "Avoidance", positive: "Approach" },
      axis2: { negative: "Vindictive", positive: "Empathetic" }
    };
    
    // Add quadrant labels with dynamic axes
    const topLeft = this.add.text(mapLeft + mapWidth * 0.25, mapTop + mapHeight * 0.25, 
      `${axes.axis1.positive.toUpperCase()}\n+\n${axes.axis2.negative.toUpperCase()}`, {
      fontSize: '14px', color: '#60A5FA', fontStyle: 'bold', align: 'center'
    }).setOrigin(0.5);
    
    const topRight = this.add.text(centerX + mapWidth * 0.25, mapTop + mapHeight * 0.25, 
      `${axes.axis1.negative.toUpperCase()}\n+\n${axes.axis2.negative.toUpperCase()}`, {
      fontSize: '14px', color: '#F87171', fontStyle: 'bold', align: 'center'
    }).setOrigin(0.5);
    
    const bottomLeft = this.add.text(mapLeft + mapWidth * 0.25, centerY + mapHeight * 0.25, 
      `${axes.axis1.positive.toUpperCase()}\n+\n${axes.axis2.positive.toUpperCase()}`, {
      fontSize: '14px', color: '#FBBF24', fontStyle: 'bold', align: 'center'
    }).setOrigin(0.5);
    
    const bottomRight = this.add.text(centerX + mapWidth * 0.25, centerY + mapHeight * 0.25, 
      `${axes.axis1.negative.toUpperCase()}\n+\n${axes.axis2.positive.toUpperCase()}`, {
      fontSize: '14px', color: '#34D399', fontStyle: 'bold', align: 'center'
    }).setOrigin(0.5);
    
    this.axisLabels = [topLeft, topRight, bottomLeft, bottomRight];
  }

  // Helper function to convert screen coordinates to emotional values
  screenToEmotional(screenX: number, screenY: number): { axis1: number; axis2: number } {
    const centerX = this.gameWidth / 2;
    const centerY = this.gameHeight / 2;
    const margin = 60;
    const mapWidth = this.gameWidth - (margin * 2);
    const mapHeight = this.gameHeight - (margin * 2);
    
    // Convert to emotional axes (-1 to +1)
    // X-axis: Axis1 positive (-1) to Axis1 negative (+1)
    const axis1 = -((screenX - centerX) / (mapWidth / 2));
    // Y-axis: Axis2 negative (-1) to Axis2 positive (+1) 
    const axis2 = ((screenY - centerY) / (mapHeight / 2));
    
    return { 
      axis1: Math.max(-1, Math.min(1, axis1)), 
      axis2: Math.max(-1, Math.min(1, axis2)) 
    };
  }

  // Helper function to convert emotional values to screen coordinates
  emotionalToScreen(axis1: number, axis2: number): Point {
    const centerX = this.gameWidth / 2;
    const centerY = this.gameHeight / 2;
    const margin = 60;
    const mapWidth = this.gameWidth - (margin * 2);
    const mapHeight = this.gameHeight - (margin * 2);
    
    const screenX = centerX - (axis1 * mapWidth / 2);
    const screenY = centerY + (axis2 * mapHeight / 2);
    
    return { x: screenX, y: screenY };
  }

  // Get which quadrant a player is in
  getEmotionalQuadrant(x: number, y: number): string {
    const emotional = this.screenToEmotional(x, y);
    
    if (emotional.axis1 > 0 && emotional.axis2 < 0) {
      return 'Axis1+ Axis2-';
    } else if (emotional.axis1 < 0 && emotional.axis2 < 0) {
      return 'Axis1- Axis2-';
    } else if (emotional.axis1 > 0 && emotional.axis2 > 0) {
      return 'Axis1+ Axis2+';
    } else {
      return 'Axis1- Axis2+';
    }
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
    
    // Movement boundaries respect coordinate plane margins
    const margin = 60;
    const minX = margin + 20;
    const maxX = this.gameWidth - margin - 20;
    const minY = margin + 20;
    const maxY = this.gameHeight - margin - 20;

    if (this.cursors.left.isDown) {
      newX = Math.max(minX, newX - speed);
      moved = true;
    }
    if (this.cursors.right.isDown) {
      newX = Math.min(maxX, newX + speed);
      moved = true;
    }
    if (this.cursors.up.isDown) {
      newY = Math.max(minY, newY - speed);
      moved = true;
    }
    if (this.cursors.down.isDown) {
      newY = Math.min(maxY, newY + speed);
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
    // Don't update if scene isn't ready
    if (!this.add) return;
    
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

      // Since we removed zones, no special zone-based visual effects
      // Keep normal styling for all players
      neuron.setScale(1.0);
      neuron.setStrokeStyle(2, 0xffffff);
      if ((neuron as any).nameText) {
        (neuron as any).nameText.setStyle({ 
          color: '#ffffff',
          fontSize: '12px',
          fontStyle: 'normal'
        });
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
    // Don't create if scene isn't ready
    if (!this.add) return;
    
    // Create scenario container (initially hidden)
    this.scenarioUI.container = this.add.container(this.gameWidth / 2, 100);
    this.scenarioUI.container.setVisible(false);

    // Background (larger to accommodate more text)
    this.scenarioUI.background = this.add.rectangle(0, 0, this.gameWidth * 0.95, 160, 0x000000, 0.9);
    this.scenarioUI.background.setStrokeStyle(2, 0xffffff, 0.8);
    this.scenarioUI.container.add(this.scenarioUI.background);

    // Scenario text (adjusted for longer content)
    this.scenarioUI.text = this.add.text(0, -35, '', {
      fontSize: '16px',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: this.gameWidth * 0.88 },
      lineSpacing: 4
    });
    this.scenarioUI.text.setOrigin(0.5);
    this.scenarioUI.container.add(this.scenarioUI.text);

    // Timer
    this.scenarioUI.timer = this.add.text(0, 35, '', {
      fontSize: '20px',
      color: '#ffff00',
      align: 'center',
      fontStyle: 'bold'
    });
    this.scenarioUI.timer.setOrigin(0.5);
    this.scenarioUI.container.add(this.scenarioUI.timer);

    // Response count
    this.scenarioUI.responseCount = this.add.text(0, 55, '', {
      fontSize: '12px',
      color: '#00ff00',
      align: 'center'
    });
    this.scenarioUI.responseCount.setOrigin(0.5);
    this.scenarioUI.container.add(this.scenarioUI.responseCount);

    // Loading text
    this.scenarioUI.loadingText = this.add.text(0, 75, '', {
      fontSize: '12px',
      color: '#ffffff',
      align: 'center'
    });
    this.scenarioUI.loadingText.setOrigin(0.5);
    this.scenarioUI.container.add(this.scenarioUI.loadingText);
  }

  handleScenarioLoading() {
    this.isLoadingScenario = true;
    this.currentScenario = null;
    this.scenarioEndTime = 0;
    
    // Hide existing scenario content
    if (this.scenarioUI.text) {
      this.scenarioUI.text.setVisible(false);
    }
    if (this.scenarioUI.timer) {
      this.scenarioUI.timer.setVisible(false);
    }
    if (this.scenarioUI.responseCount) {
      this.scenarioUI.responseCount.setVisible(false);
    }
    
    // Show loading indicator
    if (this.scenarioUI.loadingText) {
      this.scenarioUI.loadingText.setText('🧠 Generating new scenario...\nThis may take a moment');
      this.scenarioUI.loadingText.setVisible(true);
    }
    
    // Clear current axes - don't show defaults during loading
    this.currentAxes = null;
    this.updateAxisLabels();
    this.createMiniMapAxisLabels();
    
    // Make scenario UI visible
    if (this.scenarioUI.container) {
      this.scenarioUI.container.setVisible(true);
    }
    
    console.log('Scenario loading started');
  }

  handleNewScenario(scenario: any) {
    this.isLoadingScenario = false;
    this.currentScenario = scenario;
    this.scenarioEndTime = Date.now() + scenario.duration;
    
    // Hide loading indicator
    if (this.scenarioUI.loadingText) {
      this.scenarioUI.loadingText.setVisible(false);
    }
    
    // Update axes for this scenario
    if (scenario.axes) {
      this.currentAxes = scenario.axes;
      this.updateAxisLabels();
      this.createMiniMapAxisLabels();
    }
    
    // Show scenario content
    if (this.scenarioUI.text) {
      this.scenarioUI.text.setText(scenario.text);
      this.scenarioUI.text.setVisible(true);
      console.log('Scenario UI text set to:', scenario.text);
    } else {
      console.log('ERROR: scenarioUI.text is null');
    }
    
    // Show timer and response count
    if (this.scenarioUI.timer) {
      this.scenarioUI.timer.setVisible(true);
    }
    if (this.scenarioUI.responseCount) {
      this.scenarioUI.responseCount.setVisible(true);
    }
    
    // Make scenario UI visible
    if (this.scenarioUI.container) {
      this.scenarioUI.container.setVisible(true);
      console.log('Scenario UI container made visible');
    } else {
      console.log('ERROR: scenarioUI.container is null');
    }
    
    // Show feedback about LLM usage
    if (scenario.usedFallback) {
      console.log('Scenario uses fallback content');
    } else {
      console.log('Scenario generated by LLM');
    }
    
    console.log('New scenario started:', scenario.text);
    console.log('Dynamic axes:', scenario.axes);
  }

  handleCurrentScenario(scenario: any) {
    this.isLoadingScenario = false;
    this.currentScenario = scenario;
    this.scenarioEndTime = Date.now() + scenario.timeLeft;
    
    // Hide loading indicator
    if (this.scenarioUI.loadingText) {
      this.scenarioUI.loadingText.setVisible(false);
    }
    
    // Update axes for this scenario
    if (scenario.axes) {
      this.currentAxes = scenario.axes;
      this.updateAxisLabels();
      this.createMiniMapAxisLabels();
    }
    
    // Show scenario content
    if (this.scenarioUI.text) {
      this.scenarioUI.text.setText(scenario.text);
      this.scenarioUI.text.setVisible(true);
    }
    
    // Show timer and response count
    if (this.scenarioUI.timer) {
      this.scenarioUI.timer.setVisible(true);
    }
    if (this.scenarioUI.responseCount) {
      this.scenarioUI.responseCount.setVisible(true);
    }
    
    // Make scenario UI visible
    if (this.scenarioUI.container) {
      this.scenarioUI.container.setVisible(true);
    }
  }

  handleScenarioEnd(data: any) {
    this.currentScenario = null;
    this.scenarioEndTime = 0;
    
    // The old scenario end handling is now replaced by the score system
    // This method is kept for backward compatibility but does minimal work
    
    console.log('Scenario ended, score system will take over');
  }

  updateResponseCount(count: number) {
    if (this.scenarioUI.responseCount) {
      this.scenarioUI.responseCount.setText(`Responses: ${count}`);
    }
  }

  // Create scoring meters UI
  createScoringUI() {
    this.scoringUI.container = this.add.container(this.gameWidth - 200, 20);
    
    // Background
    const bg = this.add.rectangle(0, 0, 180, 120, 0x000000, 0.8);
    bg.setStrokeStyle(2, 0xffffff, 0.6);
    this.scoringUI.container.add(bg);
    
    // Title
    const title = this.add.text(0, -45, 'GAME STATE', {
      fontSize: '12px',
      color: '#ffffff',
      fontStyle: 'bold',
      align: 'center'
    });
    title.setOrigin(0.5);
    this.scoringUI.container.add(title);
    
    // Mental Stability
    const mentalLabel = this.add.text(-70, -25, 'Mental:', {
      fontSize: '10px',
      color: '#ffffff'
    });
    this.scoringUI.container.add(mentalLabel);
    
    this.scoringUI.mentalStabilityBar = this.add.rectangle(10, -25, 100, 8, 0x10B981);
    this.scoringUI.container.add(this.scoringUI.mentalStabilityBar);
    
    // Social Reputation
    const socialLabel = this.add.text(-70, -5, 'Social:', {
      fontSize: '10px',
      color: '#ffffff'
    });
    this.scoringUI.container.add(socialLabel);
    
    this.scoringUI.socialReputationBar = this.add.rectangle(10, -5, 100, 8, 0x3B82F6);
    this.scoringUI.container.add(this.scoringUI.socialReputationBar);
    
    // Chaos
    const chaosLabel = this.add.text(-70, 15, 'Chaos:', {
      fontSize: '10px',
      color: '#ffffff'
    });
    this.scoringUI.container.add(chaosLabel);
    
    this.scoringUI.chaosBar = this.add.rectangle(10, 15, 100, 8, 0xEF4444);
    this.scoringUI.container.add(this.scoringUI.chaosBar);
    
    // Round counter
    const roundText = this.add.text(0, 35, `Round ${this.gameState.round}/${this.gameState.totalRounds}`, {
      fontSize: '10px',
      color: '#ffffff',
      align: 'center'
    });
    roundText.setOrigin(0.5);
    this.scoringUI.container.add(roundText);
  }

  // Create team voting visualization
  createTeamVotingUI() {
    // Don't create if scene isn't ready
    if (!this.add) return;
    
    this.teamVotingUI.container = this.add.container(0, 0);
    this.teamVotingUI.container.setVisible(false);
    
    // Team position marker (average of all players)
    this.teamVotingUI.teamMarker = this.add.circle(0, 0, 12, 0xFFFF00, 0.8);
    this.teamVotingUI.teamMarker.setStrokeStyle(3, 0xFFFFFF);
    this.teamVotingUI.container.add(this.teamVotingUI.teamMarker);
    
    // Ideal position marker (hidden until scenario ends)
    this.teamVotingUI.idealMarker = this.add.circle(0, 0, 8, 0x00FF00, 0.8);
    this.teamVotingUI.idealMarker.setStrokeStyle(2, 0xFFFFFF);
    this.teamVotingUI.idealMarker.setVisible(false);
    this.teamVotingUI.container.add(this.teamVotingUI.idealMarker);
  }

  // Update scoring meters
  updateScoringUI(gameState: any) {
    this.gameState = { ...this.gameState, ...gameState };
    
    if (this.scoringUI.mentalStabilityBar) {
      const width = (this.gameState.mentalStability / 100) * 100;
      this.scoringUI.mentalStabilityBar.setSize(width, 8);
      this.scoringUI.mentalStabilityBar.setPosition(-50 + width/2, -25);
    }
    
    if (this.scoringUI.socialReputationBar) {
      const width = (this.gameState.socialReputation / 100) * 100;
      this.scoringUI.socialReputationBar.setSize(width, 8);
      this.scoringUI.socialReputationBar.setPosition(-50 + width/2, -5);
    }
    
    if (this.scoringUI.chaosBar) {
      const width = (this.gameState.chaos / 100) * 100;
      this.scoringUI.chaosBar.setSize(width, 8);
      this.scoringUI.chaosBar.setPosition(-50 + width/2, 15);
    }
  }

  // Show team voting results
  showTeamVotingResults(teamResponse: any, idealResponse: any) {
    if (!this.teamVotingUI.container || !this.teamVotingUI.teamMarker || !this.teamVotingUI.idealMarker) {
      return;
    }
    
    this.teamVotingUI.container.setVisible(true);
    
    // Position team marker - handle both old and new response formats
    const teamAxis1 = teamResponse.axis1 !== undefined ? teamResponse.axis1 : teamResponse.approach;
    const teamAxis2 = teamResponse.axis2 !== undefined ? teamResponse.axis2 : teamResponse.empathy;
    const teamScreen = this.emotionalToScreen(teamAxis1, teamAxis2);
    if (this.teamVotingUI.teamMarker) {
      this.teamVotingUI.teamMarker.setPosition(teamScreen.x, teamScreen.y);
    }
    
    // Position and show ideal marker - handle both old and new response formats
    const idealAxis1 = idealResponse.axis1 !== undefined ? idealResponse.axis1 : idealResponse.approach;
    const idealAxis2 = idealResponse.axis2 !== undefined ? idealResponse.axis2 : idealResponse.empathy;
    const idealScreen = this.emotionalToScreen(idealAxis1, idealAxis2);
    if (this.teamVotingUI.idealMarker) {
      this.teamVotingUI.idealMarker.setPosition(idealScreen.x, idealScreen.y);
      this.teamVotingUI.idealMarker.setVisible(true);
    }
    
    // Hide markers after 5 seconds
    this.time.delayedCall(5000, () => {
      if (this.teamVotingUI.container) {
        this.teamVotingUI.container.setVisible(false);
      }
      if (this.teamVotingUI.idealMarker) {
        this.teamVotingUI.idealMarker.setVisible(false);
      }
    });
  }

  handleGameComplete(data: any) {
    console.log('Game completed with', data.responses.length, 'responses');
    
    if (this.scenarioUI.container) {
      this.scenarioUI.container.setVisible(false);
    }
    
    this.currentScenario = null;
    this.scenarioEndTime = 0;
  }

  createTeamVotingBar() {
    // Don't create if scene isn't ready
    if (!this.add) return;
    
    // Create a 2D mini-map instead of 1D bar
    const miniMapSize = 120;
    const miniMapX = (this.gameWidth - miniMapSize) / 2; // Center horizontally
    const miniMapY = this.gameHeight - miniMapSize - 40; // Bottom with margin
    
    // Create background graphics for the mini-map
    this.teamVoteBar = this.add.graphics();
    
    // Create smooth 4-way gradient to match main map
    this.teamVoteBar.fillGradientStyle(
      0x3B82F6,  // Top-left: Blue
      0xEF4444,  // Top-right: Red  
      0xF59E0B,  // Bottom-left: Gold
      0x10B981,  // Bottom-right: Green
      0.7        // Slightly more opaque than main map
    );
    this.teamVoteBar.fillRect(miniMapX, miniMapY, miniMapSize, miniMapSize);
    
    // Draw border only, no internal lines
    this.teamVoteBar.lineStyle(2, 0xffffff, 0.8);
    this.teamVoteBar.strokeRect(miniMapX, miniMapY, miniMapSize, miniMapSize);
    
    // Create team vote indicator (larger and more visible)
    this.teamVoteIndicator = this.add.circle(
      miniMapX + miniMapSize / 2, 
      miniMapY + miniMapSize / 2, 
      8, 
      0xFFFFFF
    );
    this.teamVoteIndicator.setStrokeStyle(2, 0x000000);
    
    // Add title above the mini-map
    this.add.text(miniMapX + miniMapSize / 2, miniMapY - 25, 'Team Average', {
      fontSize: '14px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);
    
    // Create dynamic axis labels that can be updated
    this.createMiniMapAxisLabels();
  }
  
  createMiniMapAxisLabels() {
    // Don't create if scene isn't ready
    if (!this.add) return;
    
    // Clear existing mini map labels
    this.miniMapAxisLabels.forEach(label => label.destroy());
    this.miniMapAxisLabels = [];
    
    const miniMapX = this.gameWidth - 150;
    const miniMapY = 200;
    const miniMapSize = 100;
    
    // Handle loading state for mini map labels
    if (this.isLoadingScenario && !this.currentAxes) {
      // Show loading text on mini map
      const loadingLabel = this.add.text(miniMapX, miniMapY + miniMapSize + 20, 
        'Loading axes...', {
        fontSize: '10px', 
        color: '#888888', 
        fontStyle: 'italic',
        align: 'center'
      }).setOrigin(0.5);
      
      this.miniMapAxisLabels = [loadingLabel];
      return;
    }
    
    // Use current axes or defaults
    const axes = this.currentAxes || {
      axis1: { negative: "Avoidance", positive: "Approach" },
      axis2: { negative: "Vindictive", positive: "Empathetic" }
    };
    
    // Horizontal axis label (bottom)
    const horizontalLabel = this.add.text(miniMapX, miniMapY + miniMapSize + 15, 
      `${axes.axis1.negative} ← → ${axes.axis1.positive}`, {
      fontSize: '8px', color: '#ffffff', align: 'center'
    }).setOrigin(0.5);
    
    // Vertical axis label (right side, rotated)
    const verticalLabel = this.add.text(miniMapX + miniMapSize + 20, miniMapY, 
      `${axes.axis2.negative} ↑ ↓ ${axes.axis2.positive}`, {
      fontSize: '8px', color: '#ffffff', align: 'center'
    }).setOrigin(0.5).setRotation(-Math.PI / 2);
    
    this.miniMapAxisLabels = [horizontalLabel, verticalLabel];
  }
  
  updateTeamVotingBar() {
    if (!this.teamVoteIndicator) return;
    
    const miniMapSize = 120;
    const miniMapX = (this.gameWidth - miniMapSize) / 2;
    const miniMapY = this.gameHeight - miniMapSize - 40;
    
    // Convert team vote to mini-map position
    // axis1: -1 (left) to +1 (right) -> convert to 0-1 range
    // axis2: -1 (top) to +1 (bottom) -> convert to 0-1 range
    const normalizedX = (this.currentTeamVote.axis1 + 1) / 2; // Convert -1,1 to 0,1
    const normalizedY = (this.currentTeamVote.axis2 + 1) / 2; // Convert -1,1 to 0,1
    
    const indicatorX = miniMapX + (normalizedX * miniMapSize);
    const indicatorY = miniMapY + (normalizedY * miniMapSize);
    
    console.log(`Mini-map update: vote(${this.currentTeamVote.axis1.toFixed(2)}, ${this.currentTeamVote.axis2.toFixed(2)}) -> pos(${indicatorX.toFixed(0)}, ${indicatorY.toFixed(0)})`);
    
    this.teamVoteIndicator.setPosition(indicatorX, indicatorY);
    
    // Update color based on dominant quadrant but with more nuance
    const intensity = Math.sqrt(
      this.currentTeamVote.axis1 * this.currentTeamVote.axis1 + 
      this.currentTeamVote.axis2 * this.currentTeamVote.axis2
    );
    
    let color = 0xFFFFFF; // Default white for center
    if (intensity > 0.2) { // Lower threshold for color changes
      // Map to correct quadrant colors based on coordinate system:
      // Top-left: axis1 < 0, axis2 < 0 -> Red
      // Top-right: axis1 > 0, axis2 < 0 -> Blue  
      // Bottom-left: axis1 < 0, axis2 > 0 -> Green
      // Bottom-right: axis1 > 0, axis2 > 0 -> Gold
      if (this.currentTeamVote.axis1 < 0 && this.currentTeamVote.axis2 < 0) {
        color = 0xF87171; // Red (top-left)
      } else if (this.currentTeamVote.axis1 > 0 && this.currentTeamVote.axis2 < 0) {
        color = 0x60A5FA; // Blue (top-right)
      } else if (this.currentTeamVote.axis1 < 0 && this.currentTeamVote.axis2 > 0) {
        color = 0x34D399; // Green (bottom-left)
      } else if (this.currentTeamVote.axis1 > 0 && this.currentTeamVote.axis2 > 0) {
        color = 0xFBBF24; // Gold (bottom-right)
      }
    }
    
    this.teamVoteIndicator.setFillStyle(color);
    
    // Make the indicator pulse slightly to draw attention
    this.teamVoteIndicator.setScale(1.2 + Math.sin(Date.now() / 500) * 0.1);
  }

  handleTeamVoteUpdate(data: any) {
    console.log('Team vote update received:', data);
    
    if (data.teamVote) {
      console.log('Updating team vote to:', data.teamVote);
      this.currentTeamVote = data.teamVote;
      this.updateTeamVotingBar();
    }
    
    // Update axes if they've changed
    if (data.axes && JSON.stringify(data.axes) !== JSON.stringify(this.currentAxes)) {
      this.currentAxes = data.axes;
      this.updateAxisLabels();
      this.createMiniMapAxisLabels(); // Update mini map labels too
    }
  }

  createScoreUI() {
    // Don't create if scene isn't ready
    if (!this.add) return;
    
    // Create score display container (initially hidden)
    this.scoreUI.container = this.add.container(this.gameWidth / 2, this.gameHeight / 2);
    this.scoreUI.container.setVisible(false);

    // Background
    this.scoreUI.background = this.add.rectangle(0, 0, this.gameWidth * 0.8, this.gameHeight * 0.7, 0x000000, 0.95);
    this.scoreUI.background.setStrokeStyle(3, 0xffffff, 0.8);
    this.scoreUI.container.add(this.scoreUI.background);

    // Loading text
    this.scoreUI.loadingText = this.add.text(0, 0, '', {
      fontSize: '18px',
      color: '#ffffff',
      align: 'center'
    });
    this.scoreUI.loadingText.setOrigin(0.5);
    this.scoreUI.container.add(this.scoreUI.loadingText);

    // What you should have done text
    this.scoreUI.whatYouShouldHaveText = this.add.text(0, -120, '', {
      fontSize: '16px',
      color: '#00ff00',
      align: 'center',
      wordWrap: { width: this.gameWidth * 0.7 }
    });
    this.scoreUI.whatYouShouldHaveText.setOrigin(0.5);
    this.scoreUI.container.add(this.scoreUI.whatYouShouldHaveText);

    // What you actually did text
    this.scoreUI.whatYouActuallyDidText = this.add.text(0, 120, '', {
      fontSize: '16px',
      color: '#ff8888',
      align: 'center',
      wordWrap: { width: this.gameWidth * 0.7 }
    });
    this.scoreUI.whatYouActuallyDidText.setOrigin(0.5);
    this.scoreUI.container.add(this.scoreUI.whatYouActuallyDidText);

    // Accuracy text
    this.scoreUI.accuracyText = this.add.text(0, 160, '', {
      fontSize: '20px',
      color: '#ffff00',
      align: 'center',
      fontStyle: 'bold'
    });
    this.scoreUI.accuracyText.setOrigin(0.5);
    this.scoreUI.container.add(this.scoreUI.accuracyText);

    // Mini map will be created dynamically when score is displayed
    this.scoreUI.miniMapAxisLabels = [];
  }

  handleScoreLoading() {
    this.isLoadingScore = true;
    this.currentScore = null;

    // Hide all other UI
    if (this.scenarioUI.container) {
      this.scenarioUI.container.setVisible(false);
    }

    // Show loading indicator
    if (this.scoreUI.loadingText) {
      this.scoreUI.loadingText.setText('🧠 Analyzing your performance...\nGenerating feedback...');
      this.scoreUI.loadingText.setVisible(true);
    }

    // Hide other score elements
    if (this.scoreUI.whatYouShouldHaveText) {
      this.scoreUI.whatYouShouldHaveText.setVisible(false);
    }
    if (this.scoreUI.whatYouActuallyDidText) {
      this.scoreUI.whatYouActuallyDidText.setVisible(false);
    }
    if (this.scoreUI.accuracyText) {
      this.scoreUI.accuracyText.setVisible(false);
    }

    // Show score UI container
    if (this.scoreUI.container) {
      this.scoreUI.container.setVisible(true);
    }

    console.log('Score loading started');
  }

  handleScoreDisplay(data: any) {
    this.isLoadingScore = false;
    this.currentScore = data;

    // Hide loading indicator
    if (this.scoreUI.loadingText) {
      this.scoreUI.loadingText.setVisible(false);
    }

    // Create mini map showing ideal vs actual
    this.createScoreMiniMap(data);

    // Show what you should have done
    if (this.scoreUI.whatYouShouldHaveText) {
      this.scoreUI.whatYouShouldHaveText.setText(`What you should have done:\n${data.whatYouShouldHaveDone}`);
      this.scoreUI.whatYouShouldHaveText.setVisible(true);
    }

    // Show what you actually did
    if (this.scoreUI.whatYouActuallyDidText) {
      this.scoreUI.whatYouActuallyDidText.setText(`What you actually did:\n${data.whatYouActuallyDid}`);
      this.scoreUI.whatYouActuallyDidText.setVisible(true);
    }

    // Show accuracy
    if (this.scoreUI.accuracyText) {
      this.scoreUI.accuracyText.setText(`Accuracy: ${data.accuracy.toFixed(1)}%`);
      this.scoreUI.accuracyText.setVisible(true);
    }

    // Hide score UI after 20 seconds
    this.time.delayedCall(20000, () => {
      if (this.scoreUI.container) {
        this.scoreUI.container.setVisible(false);
      }
    });

    console.log('Score display shown:', data.accuracy.toFixed(1) + '%');
  }

  createScoreMiniMap(data: any) {
    // Clear existing mini map
    if (this.scoreUI.miniMap) {
      this.scoreUI.miniMap.destroy();
    }
    if (this.scoreUI.teamMarker) {
      this.scoreUI.teamMarker.destroy();
    }
    if (this.scoreUI.idealMarker) {
      this.scoreUI.idealMarker.destroy();
    }
    this.scoreUI.miniMapAxisLabels?.forEach(label => label.destroy());
    this.scoreUI.miniMapAxisLabels = [];

    const miniMapSize = 200;
    const miniMapX = 0; // Centered in score container
    const miniMapY = -20; // Slightly above center

    // Create mini map graphics
    this.scoreUI.miniMap = this.add.graphics();
    
    // Create 4-way gradient
    this.scoreUI.miniMap.fillGradientStyle(
      0x3B82F6,  // Top-left: Blue
      0xEF4444,  // Top-right: Red  
      0xF59E0B,  // Bottom-left: Gold
      0x10B981,  // Bottom-right: Green
      0.7
    );
    this.scoreUI.miniMap.fillRect(
      miniMapX - miniMapSize/2, 
      miniMapY - miniMapSize/2, 
      miniMapSize, 
      miniMapSize
    );
    
    // Border
    this.scoreUI.miniMap.lineStyle(2, 0xffffff, 0.8);
    this.scoreUI.miniMap.strokeRect(
      miniMapX - miniMapSize/2, 
      miniMapY - miniMapSize/2, 
      miniMapSize, 
      miniMapSize
    );
    
    this.scoreUI.container?.add(this.scoreUI.miniMap);

    // Convert positions to mini map coordinates
    const teamX = miniMapX + (data.teamResponse.axis1 * miniMapSize / 2);
    const teamY = miniMapY + (data.teamResponse.axis2 * miniMapSize / 2);
    const idealX = miniMapX + (data.idealResponse.axis1 * miniMapSize / 2);
    const idealY = miniMapY + (data.idealResponse.axis2 * miniMapSize / 2);

    // Team marker (red)
    this.scoreUI.teamMarker = this.add.circle(teamX, teamY, 12, 0xff0000, 0.9);
    this.scoreUI.teamMarker.setStrokeStyle(3, 0xffffff);
    this.scoreUI.container?.add(this.scoreUI.teamMarker);

    // Ideal marker (green)
    this.scoreUI.idealMarker = this.add.circle(idealX, idealY, 10, 0x00ff00, 0.9);
    this.scoreUI.idealMarker.setStrokeStyle(2, 0xffffff);
    this.scoreUI.container?.add(this.scoreUI.idealMarker);

    // Axis labels
    const axes = data.axes;
    
    // Horizontal axis label (bottom)
    const horizontalLabel = this.add.text(miniMapX, miniMapY + miniMapSize/2 + 20, 
      `${axes.axis1.negative} ← → ${axes.axis1.positive}`, {
      fontSize: '12px', color: '#ffffff', align: 'center'
    }).setOrigin(0.5);
    this.scoreUI.container?.add(horizontalLabel);
    this.scoreUI.miniMapAxisLabels?.push(horizontalLabel);
    
    // Vertical axis label (right side)
    const verticalLabel = this.add.text(miniMapX + miniMapSize/2 + 30, miniMapY, 
      `${axes.axis2.negative} ↑ ↓ ${axes.axis2.positive}`, {
      fontSize: '12px', color: '#ffffff', align: 'center'
    }).setOrigin(0.5).setRotation(-Math.PI / 2);
    this.scoreUI.container?.add(verticalLabel);
    this.scoreUI.miniMapAxisLabels?.push(verticalLabel);

    // Legend
    const legend = this.add.text(miniMapX, miniMapY + miniMapSize/2 + 50, 
      '🔴 Your Team     🟢 Ideal', {
      fontSize: '14px', color: '#ffffff', align: 'center'
    }).setOrigin(0.5);
    this.scoreUI.container?.add(legend);
    this.scoreUI.miniMapAxisLabels?.push(legend);
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

      socket.on('game:complete', () => {
        setCurrentScenario(null);
        setTimeLeft(0);
        setHasResponded(false);
        setResponse('');
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