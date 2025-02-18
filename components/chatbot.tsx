'use client'
import { useState } from 'react'
import axios from 'axios'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function Chatbot() {
  const [input, setInput] = useState<string>('')
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState<boolean>(false)

  const sendMessage = async () => {
    if (!input.trim()) return

    const newMessage: Message = { role: 'user', content: input }
    setMessages((prev) => [...prev, newMessage])
    setLoading(true)

    try {
      const response = await axios.post('/api/chat', { userMessage: input })
      console.log('Réponse du chatbot :', response.data.message)

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: response.data.message },
      ])
    } catch (error) {
      console.error('Erreur API :', error)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: ' Erreur : Impossible de répondre.' },
      ])
    }

    setLoading(false)
    setInput('')
  }

  return (
    <div className='flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4'>
      <Card className='w-full max-w-lg bg-white shadow-md rounded-lg p-4'>
        <h1 className='text-xl font-bold mb-4 text-center'>
          Chatbot Météo Maison
        </h1>
        <div className='h-64 overflow-y-auto border p-2 mb-4 bg-gray-50 rounded'>
          {messages.map((msg, index) => (
            <p
              key={index}
              className={
                msg.role === 'user' ? 'text-blue-600' : 'text-green-600'
              }
            >
              <strong>{msg.role === 'user' ? 'you' : 'Bot'}:</strong>{' '}
              {msg.content}
            </p>
          ))}
          {loading && <p className='text-gray-500'> Chargement...</p>}
        </div>
        <div className='flex gap-2'>
          <Input
            type='text'
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            className='border p-2 w-full rounded'
            disabled={loading}
          />
          <Button
            onClick={sendMessage}
            className='bg-blue-500 text-white py-2 px-4 rounded'
            disabled={loading}
          >
            {loading ? '...' : 'Envoyer'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
