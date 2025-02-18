import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';


const functions = [
  {
    name: 'get_temperature',
    description: 'Retrieve the current temperature of a room.',
    parameters: {
      type: 'object',
      properties: {
        room: {
          type: 'string',
          description: 'The name of the room (e.g., bedroom, livingroom, kitchen).',
        },
      },
      required: ['room'],
    },
  },
  {
    name: 'set_temperature',
    description: 'Set a new temperature for a specific room.',
    parameters: {
      type: 'object',
      properties: {
        room: {
          type: 'string',
          description: 'The name of the room (e.g., bedroom, livingroom, kitchen).',
        },
        temperature: {
          type: 'number',
          description: 'The new temperature to set (in degrees Celsius).',
        },
      },
      required: ['room', 'temperature'],
    },
  },
];

export async function POST(req: Request) {
  try {
    const { userMessage } = await req.json();
    console.log('Message received:', userMessage);

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    const systemPrompt = `
      You are a smart home assistant that manages room temperatures.
      - If the user asks for a room temperature, use the function "get_temperature".
      - If the user wants to change a room's temperature, use the function "set_temperature".
      - If the request is unclear, ask the user for clarification.
      - Keep responses natural, friendly, and concise.

      Example interactions:
      - User: "What is the temperature in the bedroom?"
        Assistant: Calls "get_temperature" with { "room": "bedroom" }.
      - User: "Set the living room temperature to 25°C."
        Assistant: Calls "set_temperature" with { "room": "livingroom", "temperature": 25 }.
      - User: "Can you lower the temperature in the kitchen?"
        Assistant: Asks: "To what temperature would you like me to set the kitchen?".
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
        functionResponse = await getTemperature(args.room);
      } else if (functionName === 'set_temperature') {
        functionResponse = await setTemperature(args.room, args.temperature);
      } else {
        functionResponse = 'Unknown function.';
      }

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

async function getTemperature(room: string): Promise<string> {
  const { data, error } = await supabase
    .from('room_temperatures')
    .select('temperature')
    .eq('room', room)
    .single(); 
  if (error || !data) {
    console.error('Error fetching temperature from Supabase:', error);
    return `❌ I don't have data for ${room}.`;
  }

  return `🌡️ The current temperature in ${room} is ${data.temperature}°C.`;
}

// Function to update temperature in Supabase
async function setTemperature(room: string, temperature: number): Promise<string> {
  const { error } = await supabase

    .from('room_temperatures')
    .upsert([{ room, temperature }], { onConflict: "room" }); // ✅ Correct format


  if (error) {
    console.error('Error updating temperature in Supabase:', error);
    return `❌ Failed to update the temperature of ${room}.`;
  }

  return `✅ The temperature in ${room} has been updated to ${temperature}°C in the database.`;
}
