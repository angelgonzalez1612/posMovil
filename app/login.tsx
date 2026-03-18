import { useAuth } from '@/hooks/use-auth'
import { Redirect } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function LoginScreen() {
  const { session, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (session) {
    return <Redirect href="/(tabs)" />
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Tienda POS</Text>
          <Text style={styles.title}>Iniciar sesion</Text>

          <View style={styles.form}>
            <View>
              <Text style={styles.label}>Correo</Text>
              <TextInput
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                style={styles.input}
              />
            </View>

            <View>
              <Text style={styles.label}>Contrasena</Text>
              <TextInput
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                style={styles.input}
              />
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              style={[styles.button, submitting && styles.buttonDisabled]}
              disabled={submitting || !email.trim() || !password.trim()}
              onPress={async () => {
                setSubmitting(true)
                setError('')
                try {
                  await signIn(email.trim(), password)
                } catch (authError) {
                  setError(authError instanceof Error ? authError.message : 'No se pudo iniciar sesion')
                } finally {
                  setSubmitting(false)
                }
              }}>
              {submitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Entrar</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 24,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  eyebrow: { color: '#0284c7', fontSize: 12, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' },
  title: { marginTop: 12, fontSize: 30, fontWeight: '700', color: '#0f172a' },
  form: { marginTop: 24, gap: 16 },
  label: { marginBottom: 8, fontSize: 14, fontWeight: '600', color: '#334155' },
  input: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dbe4ee',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#0f172a',
  },
  error: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#dc2626',
    fontSize: 14,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#0284c7',
    paddingVertical: 16,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#ffffff', fontSize: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2 },
})
