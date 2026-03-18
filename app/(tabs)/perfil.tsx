import { useAuth } from '@/hooks/use-auth'
import { Ionicons } from '@expo/vector-icons'
import type { Href } from 'expo-router'
import { useRouter } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function ProfileScreen() {
  const { session, signOut } = useAuth()
  const router = useRouter()

  if (!session) return null

  const isAdmin = session.user.rol === 'admin'

  const quickLinks = isAdmin
    ? [
        { label: 'Dashboard admin', hint: 'Resumen y metricas', icon: 'grid-outline' as const, route: '/(tabs)' as Href },
        { label: 'Ventas', hint: 'Cortes y ventas recientes', icon: 'wallet-outline' as const, route: '/(tabs)/ventas' as Href },
        { label: 'Ajustes', hint: 'Usuarios y roles', icon: 'settings-outline' as const, route: '/(tabs)/ajustes' as Href },
      ]
    : [
        { label: 'Inventario', hint: 'Registrar entradas', icon: 'cube-outline' as const, route: '/(tabs)/inventario' as Href },
        { label: 'Dashboard', hint: 'Resumen de stock', icon: 'grid-outline' as const, route: '/(tabs)' as Href },
      ]

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.heroCard}>
          <View style={styles.avatar}>
            <Ionicons name={isAdmin ? 'shield-checkmark-outline' : 'person-outline'} size={28} color="#0369a1" />
          </View>
          <Text style={styles.title}>{session.user.nombre}</Text>
          <Text style={styles.subtitle}>{session.user.email}</Text>
          <View style={[styles.roleBadge, isAdmin ? styles.roleBadgeAdmin : styles.roleBadgeSeller]}>
            <Text style={[styles.roleBadgeText, isAdmin ? styles.roleBadgeTextAdmin : styles.roleBadgeTextSeller]}>
              {isAdmin ? 'Administrador' : 'Vendedor'}
            </Text>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Sesion actual</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Nombre</Text>
            <Text style={styles.infoValue}>{session.user.nombre}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Correo</Text>
            <Text style={styles.infoValue}>{session.user.email}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Rol</Text>
            <Text style={styles.infoValue}>{isAdmin ? 'Administrador' : 'Vendedor'}</Text>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Accesos rapidos</Text>
          <View style={styles.linksList}>
            {quickLinks.map((link) => (
              <Pressable key={link.label} style={styles.linkRow} onPress={() => router.push(link.route)}>
                <View style={styles.linkIcon}>
                  <Ionicons name={link.icon} size={18} color="#0369a1" />
                </View>
                <View style={styles.linkBody}>
                  <Text style={styles.linkTitle}>{link.label}</Text>
                  <Text style={styles.linkHint}>{link.hint}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable style={styles.logoutButton} onPress={() => void signOut()}>
          <Ionicons name="log-out-outline" size={18} color="#ffffff" />
          <Text style={styles.logoutButtonText}>Cerrar sesion</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f3f7fb' },
  container: { padding: 20, gap: 16 },
  heroCard: {
    borderRadius: 30,
    backgroundColor: '#ffffff',
    padding: 22,
    alignItems: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e0f2fe',
  },
  title: { marginTop: 14, fontSize: 24, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  subtitle: { marginTop: 6, fontSize: 14, color: '#64748b', textAlign: 'center' },
  roleBadge: { marginTop: 14, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  roleBadgeAdmin: { backgroundColor: '#ede9fe' },
  roleBadgeSeller: { backgroundColor: '#dcfce7' },
  roleBadgeText: { fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  roleBadgeTextAdmin: { color: '#7c3aed' },
  roleBadgeTextSeller: { color: '#15803d' },
  panel: {
    borderRadius: 28,
    backgroundColor: '#ffffff',
    padding: 18,
    gap: 12,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  panelTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  infoRow: {
    borderRadius: 18,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },
  infoLabel: { fontSize: 12, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 },
  infoValue: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  linksList: { gap: 10 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    padding: 14,
  },
  linkIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e0f2fe',
  },
  linkBody: { flex: 1 },
  linkTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  linkHint: { marginTop: 3, fontSize: 12, color: '#64748b' },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 20,
    backgroundColor: '#0f172a',
    paddingVertical: 16,
  },
  logoutButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
})
