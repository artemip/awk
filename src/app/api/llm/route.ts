import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, requestType, gameState } = body;

    if (!prompt) {
      return NextResponse.json(
        { message: 'Prompt is required' },
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

    // Different system prompts based on request type
    let systemPrompt = 'You are a creative writer specializing in character dialogue for a psychological game involving different aspects of human consciousness.';
    
    if (requestType === 'axes') {
      systemPrompt = 'You are a psychology expert who generates relevant emotional/psychological dimensions for decision-making scenarios. Always respond with valid JSON only.';
    } else if (requestType === 'ideal') {
      systemPrompt = 'You are a psychology expert who determines ideal emotional responses to social situations. Consider psychological health, social appropriateness, and effectiveness. Always respond with valid JSON only.';
    } else if (requestType === 'scenario') {
      systemPrompt = 'You are a creative writer who generates awkward, relatable social scenarios for a psychological party game.';
    }

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
            content: systemPrompt
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: requestType === 'axes' || requestType === 'ideal' ? 300 : 500,
        temperature: requestType === 'axes' || requestType === 'ideal' ? 0.3 : 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const responseContent = data.choices[0]?.message?.content || 'No response generated';

    return NextResponse.json({
      response: responseContent,
      requestType: requestType || 'dialogue',
      gameState
    });
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    return NextResponse.json(
      { message: 'Failed to generate response' },
      { status: 500 }
    );
  }
} 