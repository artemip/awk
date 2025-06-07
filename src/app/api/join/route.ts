import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

const roles = ['Logic', 'Emotion', 'Memory', 'Impulse', 'Anxiety', 'Instinct'];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { message: 'Name is required and must be a string' },
        { status: 400 }
      );
    }

    const playerId = uuidv4();
    const role = roles[Math.floor(Math.random() * roles.length)];

    return NextResponse.json({
      playerId,
      role
    });
  } catch (error) {
    return NextResponse.json(
      { message: 'Invalid request body' },
      { status: 400 }
    );
  }
} 