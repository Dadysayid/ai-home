import OpenAI from 'openai'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

// ✅ Fonction pour récupérer les chambres de l'utilisateur
async function getUserRooms(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('room_temperatures')
    .select('room')
    .eq('user_id', userId)

  return error || !data ? [] : data.map((room) => room.room)
}

// ✅ Fonction pour créer une chambre si elle n'existe pas
async function createRoom(userId: string, room: string) {
  const userRooms = await getUserRooms(userId)

  if (!userRooms.includes(room)) {
    const { error } = await supabase
      .from('room_temperatures')
      .insert([{ user_id: userId, room, temperature: 22 }]) // Température par défaut : 22°C

    if (error) {
      console.error('🔥 Error creating room:', error)
      return `❌ Failed to create room ${room}.`
    }
  }
}

// ✅ Fonction pour obtenir la température actuelle d'une chambre
async function getTemperature(userId: string, room: string): Promise<string> {
  const userRooms = await getUserRooms(userId)

  if (!userRooms.includes(room)) {
    return `❌ Room "${room}" does not exist.`
  }

  const { data, error } = await supabase
    .from('room_temperatures')
    .select('temperature')
    .eq('user_id', userId)
    .eq('room', room)
    .single()

  if (error || !data) {
    return `❌ No temperature data found for ${room}.`
  }

  return `🌡️ The current temperature in ${room} is ${data.temperature}°C.`
}


async function setTemperature(
  userId: string,
  room: string,
  temperature: number,
  delayMinutes?: number
): Promise<string> {
  const userRooms = await getUserRooms(userId)

  if (!userRooms.includes(room)) {
    await createRoom(userId, room) // Crée la room si elle n'existe pas
  }

  if (delayMinutes && delayMinutes > 0) {
    const executeAt = new Date(Date.now() + delayMinutes * 60 * 1000) // Calcul de l'heure d'exécution

    const { error } = await supabase
      .from('scheduled_temperatures')
      .insert([{ user_id: userId, room, temperature, execute_at: executeAt }])

    if (error) {
      console.error('❌ Error scheduling temperature update:', error)
      return `❌ Failed to schedule temperature change for ${room}.`
    }

    return `⏳ The temperature in ${room} will be changed to ${temperature}°C at ${executeAt.toLocaleTimeString()}.`
  }

  return await applyTemperatureChange(userId, room, temperature)
}


async function applyTemperatureChange(
  userId: string,
  room: string,
  temperature: number
): Promise<string> {
  const { error } = await supabase
    .from('room_temperatures')
    .update({ temperature })
    .eq('user_id', userId)
    .eq('room', room)

  if (error) {
    console.error(`❌ Failed to update temperature for ${room}:`, error)
    return `❌ Failed to update temperature for ${room}.`
  }

  return `✅ The temperature in ${room} has been set to ${temperature}°C.`
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
      - Available rooms for this user: ${
        userRooms.length > 0 ? userRooms.join(', ') : 'None'
      }.
      - If the user asks for a temperature, call "get_temperature".
      - If they request a change, call "set_temperature".
      - If the user mentions a room that does not exist, call "create_room" before setting a temperature.
      - If they request a change in the future (e.g., "in 5 minutes"), pass the "delayMinutes" parameter to "set_temperature".
    `

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
            delayMinutes: {
              type: 'number',
              description: 'Delay in minutes before changing temperature.',
            },
          },
          required: ['room', 'temperature'],
        },
      },
      {
        name: 'create_room',
        description: 'Create a new room for the user.',
        parameters: {
          type: 'object',
          properties: {
            room: {
              type: 'string',
              description: 'The name of the room to create.',
            },
          },
          required: ['room'],
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
      let functionResponse

      if (functionName === 'get_temperature') {
        functionResponse = await getTemperature(userId, args.room)
      } else if (functionName === 'set_temperature') {
        functionResponse = await setTemperature(
          userId,
          args.room,
          args.temperature,
          args.delayMinutes || 0
        )
      } else if (functionName === 'create_room') {
        functionResponse = await createRoom(userId, args.room)
      } else {
        functionResponse = 'Unknown function.'
      }

      if (functionResponse !== null && functionResponse !== undefined) {
        await saveChatHistory(userId, userMessage, functionResponse)
        return NextResponse.json({ message: functionResponse })
      }
      return NextResponse.json({ message: '' })
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
