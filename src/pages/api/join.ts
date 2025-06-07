import { NextApiRequest, NextApiResponse } from 'next';
import { v4 as uuidv4 } from 'uuid';

const roles = ['Logic', 'Emotion', 'Memory', 'Impulse', 'Anxiety', 'Instinct'];

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { name } = req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ message: 'Name is required and must be a string' });
  }

  const playerId = uuidv4();
  const role = roles[Math.floor(Math.random() * roles.length)];

  res.status(200).json({
    playerId,
    role
  });
} 