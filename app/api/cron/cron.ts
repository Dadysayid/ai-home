import cron from 'node-cron'
import { supabase } from '@/lib/supabaseClient'

// ✅ Fonction pour mettre à jour les températures planifiées
async function processScheduledTemperatureUpdates() {
  console.log('⏳ Checking for scheduled temperature updates...')

  const currentTime = new Date().toISOString()

  // 🔍 Récupérer les températures à modifier
  const { data, error } = await supabase
    .from('scheduled_temperatures')
    .select('*')
    .lte('scheduled_time', currentTime) // Vérifie si l'heure actuelle dépasse le temps prévu

  if (error) {
    console.error('❌ Error fetching scheduled updates:', error)
    return
  }

  if (!data || data.length === 0) {
    console.log('✅ No scheduled temperature updates at this time.')
    return
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
}

// ✅ Planifier l'exécution du cron job toutes les minutes
cron.schedule('* * * * *', () => {
  console.log('🔄 Running scheduled temperature update check...')
  processScheduledTemperatureUpdates()
})

console.log('✅ Cron job started. Running every minute.')
