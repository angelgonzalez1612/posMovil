import { api } from '@/constants/api'
import { useAuth } from '@/hooks/use-auth'
import type { Role, User } from '@/lib/types'
import { Redirect } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function SettingsScreen() {
  const { session } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingUserId, setEditingUserId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'todos' | Role>('todos')
  const [form, setForm] = useState({
    nombre: '',
    email: '',
    password: '',
    rol: 'vendedor' as Role,
  })

  useEffect(() => {
    const loadUsers = async () => {
      if (!session) return

      try {
        const response = await api.get<User[]>('/usuarios', {
          headers: { Authorization: `Bearer ${session.token}` },
        })
        setUsers(response.data)
      } finally {
        setLoading(false)
      }
    }

    void loadUsers()
  }, [session])

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return users.filter((user) => {
      const matchesRole = roleFilter === 'todos' ? true : user.rol === roleFilter
      const matchesQuery = normalizedQuery
        ? [user.nombre, user.email, user.rol].join(' ').toLowerCase().includes(normalizedQuery)
        : true
      return matchesRole && matchesQuery
    })
  }, [query, roleFilter, users])

  const adminCount = users.filter((user) => user.rol === 'admin').length
  const sellerCount = users.filter((user) => user.rol === 'vendedor').length

  if (!session) return null
  if (session.user.rol !== 'admin') return <Redirect href="/(tabs)" />

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Ajustes</Text>
          <Text style={styles.title}>Usuarios y roles</Text>
          <Text style={styles.subtitle}>Crea usuarios, editalos y cambia el rol sin salir del movil.</Text>
        </View>

        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, styles.metricCardBlue]}>
            <Text style={styles.metricValue}>{users.length}</Text>
            <Text style={styles.metricLabel}>Usuarios</Text>
          </View>
          <View style={[styles.metricCard, styles.metricCardViolet]}>
            <Text style={styles.metricValue}>{adminCount}</Text>
            <Text style={styles.metricLabel}>Admins</Text>
          </View>
          <View style={[styles.metricCard, styles.metricCardGreen]}>
            <Text style={styles.metricValue}>{sellerCount}</Text>
            <Text style={styles.metricLabel}>Vendedores</Text>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>{editingUserId ? 'Editar usuario' : 'Crear usuario'}</Text>
          <TextInput value={form.nombre} onChangeText={(value) => setForm((current) => ({ ...current, nombre: value }))} placeholder="Nombre" style={styles.input} />
          <TextInput value={form.email} onChangeText={(value) => setForm((current) => ({ ...current, email: value }))} autoCapitalize="none" placeholder="Correo" style={styles.input} />
          <TextInput value={form.password} onChangeText={(value) => setForm((current) => ({ ...current, password: value }))} placeholder="Contrasena" style={styles.input} />
          <View style={styles.roleRow}>
            {(['admin', 'vendedor'] as const).map((role) => (
              <Pressable key={role} style={[styles.roleChip, form.rol === role && styles.roleChipActive]} onPress={() => setForm((current) => ({ ...current, rol: role }))}>
                <Text style={[styles.roleChipText, form.rol === role && styles.roleChipTextActive]}>{role === 'admin' ? 'Administrador' : 'Vendedor'}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            style={[styles.primaryButton, saving && styles.buttonDisabled]}
            disabled={saving || !form.nombre.trim() || !form.email.trim() || !form.password.trim()}
            onPress={async () => {
              setSaving(true)
              try {
                if (editingUserId) {
                  const response = await api.put<User>(
                    `/usuarios/${editingUserId}`,
                    form,
                    { headers: { Authorization: `Bearer ${session.token}` } },
                  )
                  setUsers((current) => current.map((user) => (user.id === editingUserId ? response.data : user)))
                } else {
                  const response = await api.post<User>(
                    '/usuarios',
                    form,
                    { headers: { Authorization: `Bearer ${session.token}` } },
                  )
                  setUsers((current) => [...current, response.data])
                }
                setEditingUserId(null)
                setForm({ nombre: '', email: '', password: '', rol: 'vendedor' })
              } finally {
                setSaving(false)
              }
            }}>
            {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>{editingUserId ? 'Actualizar usuario' : 'Guardar usuario'}</Text>}
          </Pressable>
          {editingUserId ? (
            <Pressable
              style={styles.cancelButton}
              onPress={() => {
                setEditingUserId(null)
                setForm({ nombre: '', email: '', password: '', rol: 'vendedor' })
              }}>
              <Text style={styles.cancelButtonText}>Cancelar edicion</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Usuarios registrados</Text>
          <TextInput value={query} onChangeText={setQuery} placeholder="Buscar por nombre o correo" style={styles.input} />
          <View style={styles.roleFilterRow}>
            {(['todos', 'admin', 'vendedor'] as const).map((role) => (
              <Pressable key={role} style={[styles.filterChip, roleFilter === role && styles.filterChipActive]} onPress={() => setRoleFilter(role)}>
                <Text style={[styles.filterChipText, roleFilter === role && styles.filterChipTextActive]}>
                  {role === 'todos' ? 'Todos' : role === 'admin' ? 'Administradores' : 'Vendedores'}
                </Text>
              </Pressable>
            ))}
          </View>
          {loading ? <ActivityIndicator color="#0284c7" style={{ marginTop: 16 }} /> : null}
          <View style={styles.list}>
            {filteredUsers.map((user) => (
              <View key={user.id} style={styles.userCard}>
                <View style={styles.userRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName}>{user.nombre}</Text>
                    <Text style={styles.userMeta}>{user.email}</Text>
                  </View>
                  <View style={[styles.roleBadge, user.rol === 'admin' ? styles.roleBadgeAdmin : styles.roleBadgeSeller]}>
                    <Text style={[styles.roleBadgeText, user.rol === 'admin' ? styles.roleBadgeTextAdmin : styles.roleBadgeTextSeller]}>
                      {user.rol === 'admin' ? 'Admin' : 'Vendedor'}
                    </Text>
                  </View>
                </View>

                <View style={styles.userActions}>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() => {
                      setEditingUserId(user.id)
                      setForm({
                        nombre: user.nombre,
                        email: user.email,
                        password: '',
                        rol: user.rol,
                      })
                    }}>
                    <Text style={styles.secondaryButtonText}>Editar</Text>
                  </Pressable>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={async () => {
                      const nextRole: Role = user.rol === 'admin' ? 'vendedor' : 'admin'
                      const response = await api.put<User>(
                        `/usuarios/${user.id}`,
                        { rol: nextRole },
                        { headers: { Authorization: `Bearer ${session.token}` } },
                      )
                      setUsers((current) => current.map((item) => (item.id === user.id ? response.data : item)))
                    }}>
                    <Text style={styles.secondaryButtonText}>{user.rol === 'admin' ? 'Hacer vendedor' : 'Hacer admin'}</Text>
                  </Pressable>
                </View>
              </View>
            ))}
            {!loading && filteredUsers.length === 0 ? <Text style={styles.emptyText}>No hay usuarios con ese filtro.</Text> : null}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f3f7fb' },
  container: { padding: 20, gap: 16 },
  heroCard: { borderRadius: 28, backgroundColor: '#ffffff', padding: 20 },
  eyebrow: { color: '#0284c7', fontSize: 12, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  title: { marginTop: 8, fontSize: 28, fontWeight: '800', color: '#0f172a' },
  subtitle: { marginTop: 8, fontSize: 14, lineHeight: 20, color: '#64748b' },
  metricsRow: { flexDirection: 'row', gap: 10 },
  metricCard: { flex: 1, borderRadius: 22, paddingVertical: 16, paddingHorizontal: 10, alignItems: 'center' },
  metricCardBlue: { backgroundColor: '#e0f2fe' },
  metricCardViolet: { backgroundColor: '#ede9fe' },
  metricCardGreen: { backgroundColor: '#dcfce7' },
  metricValue: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  metricLabel: { marginTop: 4, fontSize: 11, fontWeight: '700', color: '#475569', textAlign: 'center' },
  panel: { borderRadius: 28, backgroundColor: '#ffffff', padding: 18, gap: 12 },
  panelTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
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
  roleRow: { flexDirection: 'row', gap: 8 },
  roleFilterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleChip: { flex: 1, borderRadius: 16, backgroundColor: '#e2e8f0', paddingVertical: 12, alignItems: 'center' },
  roleChipActive: { backgroundColor: '#dbeafe' },
  roleChipText: { color: '#475569', fontSize: 13, fontWeight: '700' },
  roleChipTextActive: { color: '#1d4ed8' },
  filterChip: { borderRadius: 999, borderWidth: 1, borderColor: '#dbeafe', backgroundColor: '#eff6ff', paddingHorizontal: 12, paddingVertical: 8 },
  filterChipActive: { borderColor: '#0284c7', backgroundColor: '#0284c7' },
  filterChipText: { color: '#0369a1', fontSize: 12, fontWeight: '700' },
  filterChipTextActive: { color: '#ffffff' },
  primaryButton: { alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#0284c7', paddingVertical: 15 },
  buttonDisabled: { opacity: 0.7 },
  primaryButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  cancelButton: { alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#e2e8f0', paddingVertical: 14 },
  cancelButtonText: { color: '#334155', fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  list: { gap: 10, marginTop: 8 },
  userCard: { borderRadius: 20, backgroundColor: '#f8fafc', padding: 14, gap: 12 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  userName: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  userMeta: { marginTop: 4, fontSize: 12, color: '#64748b' },
  userActions: { flexDirection: 'row', gap: 8 },
  secondaryButton: { flex: 1, borderRadius: 16, backgroundColor: '#eef6ff', paddingVertical: 12, alignItems: 'center' },
  secondaryButtonText: { color: '#0369a1', fontSize: 13, fontWeight: '700' },
  roleBadge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  roleBadgeAdmin: { backgroundColor: '#ede9fe' },
  roleBadgeSeller: { backgroundColor: '#dcfce7' },
  roleBadgeText: { fontSize: 12, fontWeight: '800' },
  roleBadgeTextAdmin: { color: '#7c3aed' },
  roleBadgeTextSeller: { color: '#15803d' },
  emptyText: { paddingVertical: 12, textAlign: 'center', color: '#64748b', fontSize: 14 },
})
