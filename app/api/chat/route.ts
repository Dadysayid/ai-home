import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

// Define ENUM for valid rooms
const ROOMS = ["bedroom", "livingroom", "kitchen", "bathroom", "office"];

export async function POST(req: Request) {
  try {
    const { userMessage, userId } = await req.json();
    console.log('Message received:', userMessage, 'from user:', userId);

    if (!userId) {
      return NextResponse.json({ message: "❌ User not authenticated." }, { status: 401 });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    const functions = [
      {
        name: 'get_temperature',
        description: 'Retrieve the current temperature of a room for the logged-in user.',
        parameters: {
          type: 'object',
          properties: {
            room: {
              type: 'string',
              enum: ROOMS,
              description: 'The name of the room (e.g., bedroom, livingroom, kitchen, bathroom, office).',
            },
          },
          required: ['room'],
        },
      },
      {
        name: 'set_temperature',
        description: 'Set a new temperature for a room belonging to the logged-in user.',
        parameters: {
          type: 'object',
          properties: {
            room: {
              type: 'string',
              enum: ROOMS,
              description: 'The name of the room.',
            },
            temperature: {
              type: 'number',
              description: 'New temperature in Celsius.',
            },
          },
          required: ['room', 'temperature'],
        },
      },
    ];

    const systemPrompt = `
      You are a smart home assistant that manages room temperatures per user.
      - When a user asks for a temperature, call "get_temperature".
      - When they request a change, call "set_temperature".
      - Ensure each request is linked to the user's ID for security.
    `;

    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      functions: functions,
    });

    const message = response.choices[0].message;

    if (message.function_call) {
      const functionName = message.function_call.name;
      const args = JSON.parse(message.function_call.arguments);

      let functionResponse;

      if (functionName === 'get_temperature') {
        functionResponse = await getTemperature(userId, args.room);
      } else if (functionName === 'set_temperature') {
        functionResponse = await setTemperature(userId, args.room, args.temperature);
      } else {
        functionResponse = 'Unknown function.';
      }

     
      await saveChatHistory(userId, userMessage, functionResponse);

      return NextResponse.json({ message: functionResponse });
    }

    return NextResponse.json({ message: message.content });
  } catch (error) {
    console.error('OpenAI API Error:', error);
    return NextResponse.json(
      { message: 'Server error, please try again later.' },
      { status: 500 }
    );
  }
}

// Function to retrieve temperature for a specific user
async function getTemperature(userId: string, room: string): Promise<string> {
  if (!ROOMS.includes(room)) {
    return `❌ Invalid room name. Please choose from: ${ROOMS.join(", ")}.`;
  }

  console.log(`🔥 Fetching temperature: User=${userId}, Room=${room}`);

  const { data, error } = await supabase
    .from('room_temperatures')
    .select('temperature')
    .eq('user_id', userId) 
    .eq('room', room)
    .single();

  if (error || !data) {
    console.error('🔥 Supabase Fetch Error:', error);
    return `❌ No temperature data found for ${room}.`;
  }

  console.log('✅ Temperature Data:', data);
  return `🌡️ The current temperature in ${room} is ${data.temperature}°C.`;
}



async function setTemperature(userId: string, room: string, temperature: number): Promise<string> {
  if (!ROOMS.includes(room)) {
    return `❌ Invalid room name. Please choose from: ${ROOMS.join(", ")}.`;
  }

  console.log(`🔥 Updating temperature: User=${userId}, Room=${room}, Temp=${temperature}`);

  const { error } = await supabase
  .from('room_temperatures')
  .upsert([{ user_id: userId, room, temperature }], { onConflict: "room" }); // Use only "room" if that's your constraint


  if (error) {
    console.error('🔥 Supabase Update Error:', error);
    return `❌ Failed to update ${room}: ${error.message}`;
  }

  return `✅ The temperature in ${room} has been set to ${temperature}°C.`;
}





async function saveChatHistory(userId: string, message: string, response: string) {
  await supabase.from("chat_history").insert([{ user_id: userId, message, response }]);
}
