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
    const { error } = await supabase
      .from('room_temperatures')
      .upsert([{ user_id: userId, room, temperature: 22 }], {
        onConflict: 'user_id, room',
      }) 

    if (error) {
      console.error('🔥 Error creating room:', error)
      return `❌ Failed to create room ${room}.`
    }
    return null 
  }
  return null 
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

      if (functionResponse !== null) {
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


async function getTemperature(userId: string, room: string): Promise<string> {
  const userRooms = await getUserRooms(userId)

  if (!userRooms.includes(room)) {
    return `❌ Room "${room}" does not exist. Please create it first.`
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

async function setTemperature(userId: string, room: string, temperature: number, delayMinutes?: number): Promise<string> {
  let userRooms = await getUserRooms(userId);


  if (!userRooms.includes(room)) {
    console.log(`🏠 Room "${room}" does not exist. Creating it now...`);
    await createRoom(userId, room);  
    userRooms = await getUserRooms(userId); 
  }

  
  if (delayMinutes && delayMinutes > 0) {
    console.log(`⏳ Scheduled temperature change for ${room} in ${delayMinutes} minutes.`);

    setTimeout(async () => {
      console.log(`🔥 Applying scheduled temperature change: ${room} → ${temperature}°C`);
      const { error } = await supabase
        .from('room_temperatures')
        .update({ temperature })  
        .eq('user_id', userId)
        .eq('room', room);

      if (error) {
        console.error('❌ Scheduled temperature update failed:', error);
      } else {
        console.log(`✅ Temperature in ${room} updated to ${temperature}°C`);
      }
    }, delayMinutes * 60 * 1000);

    return `⏳ The temperature in ${room} will be changed to ${temperature}°C in ${delayMinutes} minutes.`;
  }


  console.log(`🔥 Changing temperature immediately: ${room} → ${temperature}°C`);
  const { error } = await supabase
    .from('room_temperatures')
    .update({ temperature })  
    .eq('room', room);

  if (error) {
    console.error(`❌ Failed to update temperature for ${room}:`, error);
    return `❌ Failed to update temperature for ${room}.`;
  }

  return `✅ The temperature in ${room} has been set to ${temperature}°C.`;
}


// ✅ Function to save chat history
async function saveChatHistory(
  userId: string,
  message: string,
  response: string
) {
  await supabase
    .from('chat_history')
    .insert([{ user_id: userId, message, response }])
}
