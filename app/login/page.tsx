'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async () => {
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
    } else {
      router.push('/chatbot') // 🔥 Redirect user to chatbot page
    }

    setLoading(false)
  }

  return (
    <div className='flex flex-col items-center justify-center min-h-screen p-4'>
      <h1 className='text-2xl font-bold mb-4'>Login</h1>
      <input
        type='email'
        placeholder='Email'
        className='p-2 border rounded w-80 mb-2'
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type='password'
        placeholder='Password'
        className='p-2 border rounded w-80 mb-2'
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && <p className='text-red-500'>{error}</p>}
      <button
        onClick={handleLogin}
        disabled={loading}
        className='bg-blue-500 text-white px-4 py-2 rounded'
      >
        {loading ? 'Logging in...' : 'Login'}
      </button>
      <p className='mt-2'>
        Dont have an account?{' '}
        <a href='/signup' className='text-blue-600'>
          Sign Up
        </a>
      </p>
    </div>
  )
}
