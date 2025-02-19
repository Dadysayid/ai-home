import OpenAI from 'openai'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'


async function getUserRooms(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('room_temperatures')
    .select('room')
    .eq('user_id', userId)

  return error || !data ? [] : data.map((room) => room.room)
}


async function createRoom(userId: string, room: string) {
  const userRooms = await getUserRooms(userId)

  if (!userRooms.includes(room)) {
    await supabase
      .from('room_temperatures')
      .insert([{ user_id: userId, room, temperature: 22 }]) 
  }
}

export async function POST(req: Request) {
  try {
    const { userMessage, userId } = await req.json()

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json(
        { message: '❌ User not authenticated or invalid ID.' },
        { status: 401 }
      )
    }

  
    const userRooms = await getUserRooms(userId)

    const systemPrompt = `
    You are a smart home assistant that manages room temperatures per user.
    - Available rooms for this user: ${userRooms.length > 0 ? userRooms.join(', ') : 'None'}.
    - If the user asks for a temperature, call "get_temperature".
    - If they request a change, first check if the room exists:
      - If the room exists, call "set_temperature".
      - If the room does NOT exist, first call "create_room" THEN immediately call "set_temperature".
    - Do NOT inform the user when a room is created, just proceed with setting the temperature.
  `;
  

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

    const functions = [
      {
        name: 'get_temperature',
        description: 'Retrieve the current temperature of a room.',
        parameters: {
          type: 'object',
          properties: {
            room: {
              type: 'string',
              description: 'The name of the room.',
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
    ]

    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      functions: functions,
    })

    const message = response.choices[0].message

    if (message.function_call) {
      const functionName = message.function_call.name
      const args = JSON.parse(message.function_call.arguments)
      let functionResponse = ''

      if (functionName === 'get_temperature') {
        functionResponse = await getTemperature(userId, args.room)
      } else if (functionName === 'set_temperature') {
        functionResponse = await setTemperature(
          userId,
          args.room,
          args.temperature
        )
      } else {
        functionResponse = 'Unknown function.'
      }

      await saveChatHistory(userId, userMessage, functionResponse)
      return NextResponse.json({ message: functionResponse })
    }

    return NextResponse.json({ message: message.content })
  } catch (error) {
    console.error('OpenAI API Error:', error)
    return NextResponse.json(
      { message: 'Server error, please try again later.' },
      { status: 500 }
    )
  }
}


async function getTemperature(userId: string, room: string): Promise<string> {
  const { data, error } = await supabase
    .from('room_temperatures')
    .select('temperature')
    .eq('user_id', userId)
    .eq('room', room)
    .single()

  return error || !data
    ? `❌ No temperature data found for ${room}.`
    : `🌡️ The current temperature in ${room} is ${data.temperature}°C.`
}


async function setTemperature(
  userId: string,
  room: string,
  temperature: number
): Promise<string> {
  const userRooms = await getUserRooms(userId)

  if (!userRooms.includes(room)) {
    await createRoom(userId, room) 
  }

  const { error } = await supabase
    .from('room_temperatures')
    .upsert([{ user_id: userId, room, temperature }])

  return error
    ? `❌ Failed to update temperature for ${room}.`
    : `✅ The temperature in ${room} has been set to ${temperature}°C.`
}


async function saveChatHistory(
  userId: string,
  message: string,
  response: string
) {
  await supabase
    .from('chat_history')
    .insert([{ user_id: userId, message, response }])
}
