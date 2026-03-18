import AsyncStorage from '@react-native-async-storage/async-storage'
import { api } from '@/constants/api'
import type { AuthSession } from '@/lib/types'
import axios from 'axios'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const SESSION_KEY = 'posapp-session'

type AuthContextValue = {
  session: AuthSession | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const raw = await AsyncStorage.getItem(SESSION_KEY)
        if (!raw) {
          setLoading(false)
          return
        }

        const parsed = JSON.parse(raw) as AuthSession
        const response = await api.get<{ user: AuthSession['user'] }>('/auth/me', {
          headers: {
            Authorization: `Bearer ${parsed.token}`,
          },
        })

        const nextSession = {
          ...parsed,
          user: response.data.user,
        }

        setSession(nextSession)
        await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(nextSession))
      } catch {
        await AsyncStorage.removeItem(SESSION_KEY)
        setSession(null)
      } finally {
        setLoading(false)
      }
    }

    void restoreSession()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      signIn: async (email, password) => {
        try {
          const response = await api.post<AuthSession>('/auth/login', {
            email,
            password,
          })

          setSession(response.data)
          await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(response.data))
        } catch (error) {
          if (axios.isAxiosError(error)) {
            const backendMessage = error.response?.data?.message
            throw new Error(backendMessage || 'No se pudo iniciar sesion')
          }

          throw error
        }
      },
      signOut: async () => {
        setSession(null)
        await AsyncStorage.removeItem(SESSION_KEY)
      },
    }),
    [loading, session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return context
}
