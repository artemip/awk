'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamic import to avoid SSR issues with Phaser
const GameCanvas = dynamic(() => import('../components/GameCanvas'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-96 bg-gray-800 rounded-lg">Loading game...</div>
});

interface Player {
  playerId: string;
  role: string;
  name: string;
}

export default function Home() {
  const [playerName, setPlayerName] = useState('');
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);

  const handleJoinGame = async () => {
    if (!playerName.trim()) return;
    
    setIsJoining(true);
    try {
      const response = await fetch('/api/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: playerName.trim() }),
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentPlayer({
          playerId: data.playerId,
          role: data.role,
          name: playerName.trim()
        });
        setGameStarted(true);
      } else {
        console.error('Failed to join game');
      }
    } catch (error) {
      console.error('Error joining game:', error);
    } finally {
      setIsJoining(false);
    }
  };

  const handleLeaveGame = () => {
    setCurrentPlayer(null);
    setGameStarted(false);
    setPlayerName('');
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-5xl font-bold text-white text-center mb-8 bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent">
          AWK Neural Network
        </h1>
        
        {!gameStarted ? (
          <div className="max-w-md mx-auto">
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
              <h2 className="text-2xl font-semibold text-white mb-6 text-center">Join the Network</h2>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="playerName" className="block text-sm font-medium text-gray-300 mb-2">
                    Your Name
                  </label>
                  <input
                    id="playerName"
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleJoinGame()}
                    placeholder="Enter your name..."
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                
                <button
                  onClick={handleJoinGame}
                  disabled={!playerName.trim() || isJoining}
                  className="w-full py-3 px-6 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-pink-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                >
                  {isJoining ? 'Joining...' : 'Join Network'}
                </button>
              </div>
              
              <div className="mt-6 text-center text-sm text-gray-400">
                Up to 8 players can join the neural network
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
              <div className="flex items-center space-x-4">
                <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                <div>
                  <p className="text-white font-semibold">{currentPlayer?.name}</p>
                  <p className="text-gray-300 text-sm">Role: {currentPlayer?.role}</p>
                </div>
              </div>
              
              <button
                onClick={handleLeaveGame}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors duration-200"
              >
                Leave Game
              </button>
            </div>
            
            <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/20 overflow-hidden">
              <GameCanvas player={currentPlayer} />
            </div>
            
            <div className="text-center text-sm text-gray-400">
              Use arrow keys to move your neuron • Press SPACE to send signals
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
