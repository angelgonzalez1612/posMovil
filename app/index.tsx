import { useAuth } from '@/hooks/use-auth'
import { Redirect } from 'expo-router'

export default function IndexScreen() {
  const { session } = useAuth()

  if (!session) {
    return <Redirect href="/login" />
  }

  return <Redirect href="/(tabs)" />
}
