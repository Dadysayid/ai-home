import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

// ✅ Fonction pour mettre à jour les températures planifiées
async function processScheduledTemperatureUpdates() {
  console.log('⏳ Checking for scheduled temperature updates...')

  const currentTime = new Date().toISOString()

  // 🔍 Récupérer les températures à modifier
  const { data, error } = await supabase
    .from('scheduled_temperatures')
    .select('*')
    .lte('execute_at', currentTime) // ⚠️ Vérifie que "execute_at" est bien le bon nom de la colonne dans ta BDD

  if (error) {
    console.error('❌ Error fetching scheduled updates:', error)
    return NextResponse.json(
      { error: 'Error fetching scheduled updates' },
      { status: 500 }
    )
  }

  if (!data || data.length === 0) {
    console.log('✅ No scheduled temperature updates at this time.')
    return NextResponse.json({ message: 'No scheduled updates' })
  }

  for (const entry of data) {
    const { user_id, room, temperature, id } = entry

    // 🔥 Appliquer la mise à jour de la température
    const { error: updateError } = await supabase
      .from('room_temperatures')
      .update({ temperature })
      .eq('user_id', user_id)
      .eq('room', room)

    if (updateError) {
      console.error(`❌ Failed to update temperature for ${room}:`, updateError)
      continue
    }

    console.log(`🔥 Updated temperature for ${room} to ${temperature}°C.`)

    // 🗑️ Supprimer l'entrée après exécution
    await supabase.from('scheduled_temperatures').delete().eq('id', id)
  }

  return NextResponse.json({ message: 'Scheduled temperature updates applied' })
}

// ✅ Route GET pour exécuter manuellement le cron
export async function GET() {
  try {
    return await processScheduledTemperatureUpdates()
  } catch (error) {
    console.error('❌ Error executing cron job:', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
