import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const gameState = await request.json();

    if (!gameState) {
      return NextResponse.json(
        { message: 'Game state is required' },
        { status: 400 }
      );
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    
    if (!openaiApiKey) {
      return NextResponse.json(
        { message: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const prompt = `
Given the current game state, generate an end-of-round dialogue for the characters.
Consider the roles: Logic, Emotion, Memory, Impulse, Anxiety, and Instinct.

Game State: ${JSON.stringify(gameState, null, 2)}

Generate a meaningful dialogue that reflects the current situation and the different perspectives of each character role.
`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a creative writer specializing in character dialogue for a psychological game involving different aspects of human consciousness.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const dialogue = data.choices[0]?.message?.content || 'No dialogue generated';

    return NextResponse.json({
      dialogue,
      gameState
    });
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    return NextResponse.json(
      { message: 'Failed to generate dialogue' },
      { status: 500 }
    );
  }
} 