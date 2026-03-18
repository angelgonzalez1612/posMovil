import { api } from '@/constants/api'
import { useAuth } from '@/hooks/use-auth'
import type { CashCut, Sale, User } from '@/lib/types'
import { Redirect } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

type SalesResponse = {
  data: Sale[]
  stats: {
    dia: { totalVendido: number; cantidadVentas: number }
    semana: { totalVendido: number; cantidadVentas: number }
    mes: { totalVendido: number; cantidadVentas: number }
  }
}

type CashCutResponse = {
  data: CashCut[]
}

type SalesRange = 'dia' | 'semana' | 'mes'

export default function SalesScreen() {
  const { session } = useAuth()
  const [range, setRange] = useState<SalesRange>('dia')
  const [sales, setSales] = useState<Sale[]>([])
  const [cashCuts, setCashCuts] = useState<CashCut[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [query, setQuery] = useState('')
  const [paymentFilter, setPaymentFilter] = useState<'todos' | 'efectivo' | 'tarjeta' | 'transferencia'>('todos')
  const [userFilter, setUserFilter] = useState<'todos' | number>('todos')
  const [expandedSaleId, setExpandedSaleId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      if (!session) return

      try {
        const [salesResponse, cashCutResponse, usersResponse] = await Promise.all([
          api.get<SalesResponse>('/ventas', {
            headers: { Authorization: `Bearer ${session.token}` },
          }),
          api.get<CashCutResponse>('/cortes-caja', {
            headers: { Authorization: `Bearer ${session.token}` },
          }),
          api.get<User[]>('/usuarios', {
            headers: { Authorization: `Bearer ${session.token}` },
          }),
        ])

        setSales(salesResponse.data.data)
        setCashCuts(cashCutResponse.data.data)
        setUsers(usersResponse.data)
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [session])

  const rangeStart = useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    if (range === 'semana') start.setDate(start.getDate() - 6)
    if (range === 'mes') start.setDate(start.getDate() - 29)
    return start
  }, [range])

  const rangedSales = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return sales.filter((sale) => {
      const inRange = new Date(sale.fecha) >= rangeStart
      const matchesPayment = paymentFilter === 'todos' ? true : sale.metodoPago === paymentFilter
      const matchesUser = userFilter === 'todos' ? true : sale.usuarioId === userFilter
      const cashierName = users.find((user) => user.id === sale.usuarioId)?.nombre || ''
      const matchesQuery = normalizedQuery
        ? [`${sale.id}`, cashierName, ...sale.detalles.map((detail) => detail.nombre)]
            .join(' ')
            .toLowerCase()
            .includes(normalizedQuery)
        : true

      return inRange && matchesPayment && matchesUser && matchesQuery
    })
  }, [paymentFilter, query, rangeStart, sales, userFilter, users])
  const summary = useMemo(
    () => ({
      total: rangedSales.reduce((sum, sale) => sum + sale.total, 0),
      count: rangedSales.length,
      efectivo: rangedSales.filter((sale) => sale.metodoPago === 'efectivo').reduce((sum, sale) => sum + sale.total, 0),
      tarjeta: rangedSales.filter((sale) => sale.metodoPago === 'tarjeta').reduce((sum, sale) => sum + sale.total, 0),
      transferencia: rangedSales.filter((sale) => sale.metodoPago === 'transferencia').reduce((sum, sale) => sum + sale.total, 0),
    }),
    [rangedSales],
  )

  if (!session) return null
  if (session.user.rol !== 'admin') return <Redirect href="/(tabs)" />

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Ventas</Text>
          <Text style={styles.title}>Resumen comercial</Text>
          <Text style={styles.subtitle}>Consulta ventas, pagos y los ultimos cortes desde movil.</Text>
        </View>

        <View style={styles.rangeRow}>
          {([
            { key: 'dia', label: 'Hoy' },
            { key: 'semana', label: '7 dias' },
            { key: 'mes', label: '30 dias' },
          ] as const).map((option) => (
            <Pressable key={option.key} style={[styles.rangeChip, range === option.key && styles.rangeChipActive]} onPress={() => setRange(option.key)}>
              <Text style={[styles.rangeChipText, range === option.key && styles.rangeChipTextActive]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.filtersPanel}>
          <TextInput value={query} onChangeText={setQuery} placeholder="Buscar por folio, cajero o producto" style={styles.searchInput} />
          <View style={styles.filterChips}>
            {(['todos', 'efectivo', 'tarjeta', 'transferencia'] as const).map((payment) => (
              <Pressable key={payment} style={[styles.filterChip, paymentFilter === payment && styles.filterChipActive]} onPress={() => setPaymentFilter(payment)}>
                <Text style={[styles.filterChipText, paymentFilter === payment && styles.filterChipTextActive]}>
                  {payment === 'todos' ? 'Todos' : payment}
                </Text>
              </Pressable>
            ))}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.userFilterRow}>
            <Pressable style={[styles.userPill, userFilter === 'todos' && styles.userPillActive]} onPress={() => setUserFilter('todos')}>
              <Text style={[styles.userPillText, userFilter === 'todos' && styles.userPillTextActive]}>Todos los cajeros</Text>
            </Pressable>
            {users.map((user) => (
              <Pressable key={user.id} style={[styles.userPill, userFilter === user.id && styles.userPillActive]} onPress={() => setUserFilter(user.id)}>
                <Text style={[styles.userPillText, userFilter === user.id && styles.userPillTextActive]}>{user.nombre}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#0284c7" />
          </View>
        ) : (
          <>
            <View style={styles.grid}>
              <MetricCard label="Total vendido" value={`$${summary.total.toFixed(2)}`} />
              <MetricCard label="Cantidad de ventas" value={String(summary.count)} />
            </View>

            <View style={styles.grid}>
              <MetricCard label="Efectivo" value={`$${summary.efectivo.toFixed(2)}`} tone="green" />
              <MetricCard label="Tarjeta" value={`$${summary.tarjeta.toFixed(2)}`} tone="blue" />
              <MetricCard label="Transferencia" value={`$${summary.transferencia.toFixed(2)}`} tone="violet" />
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Ventas recientes</Text>
              <View style={styles.list}>
                {rangedSales.slice(0, 8).map((sale) => (
                  <View key={sale.id} style={styles.saleCard}>
                    <Pressable style={styles.saleRow} onPress={() => setExpandedSaleId((current) => (current === sale.id ? null : sale.id))}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.saleTitle}>Venta #{sale.id}</Text>
                        <Text style={styles.saleMeta}>
                          {new Date(sale.fecha).toLocaleString()} · {sale.metodoPago} · {users.find((user) => user.id === sale.usuarioId)?.nombre || `Usuario ${sale.usuarioId}`}
                        </Text>
                      </View>
                      <View style={styles.saleRowRight}>
                        <Text style={styles.saleTotal}>${sale.total.toFixed(2)}</Text>
                        <Text style={styles.expandHint}>{expandedSaleId === sale.id ? 'Ocultar' : 'Detalle'}</Text>
                      </View>
                    </Pressable>

                    {expandedSaleId === sale.id ? (
                      <View style={styles.detailList}>
                        {sale.detalles.map((detail) => (
                          <View key={detail.id} style={styles.detailRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.detailName}>{detail.nombre}</Text>
                              <Text style={styles.detailMeta}>{detail.cantidad.toFixed(3)} × ${detail.precio.toFixed(2)}</Text>
                            </View>
                            <Text style={styles.detailSubtotal}>${(detail.subtotal ?? detail.cantidad * detail.precio).toFixed(2)}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ))}
                {rangedSales.length === 0 ? <Text style={styles.emptyText}>No hay ventas en este rango.</Text> : null}
              </View>
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Ultimos cortes</Text>
              <View style={styles.list}>
                {cashCuts.slice(0, 5).map((cut) => (
                  <View key={cut.id} style={styles.saleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.saleTitle}>Corte #{cut.id}</Text>
                      <Text style={styles.saleMeta}>{new Date(cut.createdAt).toLocaleString()} · {cut.cantidadVentas} ventas</Text>
                    </View>
                    <Text style={styles.saleTotal}>${cut.totalVentas.toFixed(2)}</Text>
                  </View>
                ))}
                {cashCuts.length === 0 ? <Text style={styles.emptyText}>Aun no hay cortes registrados.</Text> : null}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function MetricCard({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'green' | 'blue' | 'violet' }) {
  const palette =
    tone === 'green'
      ? { bg: '#ecfdf5', color: '#15803d' }
      : tone === 'blue'
        ? { bg: '#eff6ff', color: '#1d4ed8' }
        : tone === 'violet'
          ? { bg: '#f5f3ff', color: '#7c3aed' }
          : { bg: '#ffffff', color: '#0f172a' }

  return (
    <View style={[styles.metricCard, { backgroundColor: palette.bg }]}>
      <Text style={[styles.metricValue, { color: palette.color }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f3f7fb' },
  container: { padding: 20, gap: 16 },
  heroCard: { borderRadius: 28, backgroundColor: '#ffffff', padding: 20 },
  eyebrow: { color: '#0284c7', fontSize: 12, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  title: { marginTop: 8, fontSize: 28, fontWeight: '800', color: '#0f172a' },
  subtitle: { marginTop: 8, fontSize: 14, lineHeight: 20, color: '#64748b' },
  rangeRow: { flexDirection: 'row', gap: 8 },
  rangeChip: { flex: 1, borderRadius: 16, backgroundColor: '#e2e8f0', paddingVertical: 12, alignItems: 'center' },
  rangeChipActive: { backgroundColor: '#dbeafe' },
  rangeChipText: { color: '#475569', fontWeight: '700', fontSize: 13 },
  rangeChipTextActive: { color: '#1d4ed8' },
  filtersPanel: { borderRadius: 24, backgroundColor: '#ffffff', padding: 14, gap: 12 },
  searchInput: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0f172a',
  },
  filterChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: { borderColor: '#0284c7', backgroundColor: '#0284c7' },
  filterChipText: { color: '#0369a1', fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  filterChipTextActive: { color: '#ffffff' },
  userFilterRow: { gap: 8, paddingRight: 8 },
  userPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  userPillActive: { borderColor: '#0f172a', backgroundColor: '#0f172a' },
  userPillText: { color: '#475569', fontSize: 12, fontWeight: '700' },
  userPillTextActive: { color: '#ffffff' },
  loadingCard: { borderRadius: 28, backgroundColor: '#ffffff', paddingVertical: 36, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', gap: 12 },
  metricCard: { flex: 1, borderRadius: 24, padding: 16, alignItems: 'center', justifyContent: 'center' },
  metricValue: { fontSize: 24, fontWeight: '800' },
  metricLabel: { marginTop: 6, fontSize: 12, fontWeight: '700', color: '#64748b', textAlign: 'center' },
  panel: { borderRadius: 28, backgroundColor: '#ffffff', padding: 18 },
  panelTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  list: { gap: 10, marginTop: 14 },
  saleCard: { borderRadius: 20, backgroundColor: '#f8fafc' },
  saleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, backgroundColor: '#f8fafc', padding: 14 },
  saleRowRight: { alignItems: 'flex-end' },
  saleTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  saleMeta: { marginTop: 4, fontSize: 12, color: '#64748b' },
  saleTotal: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  expandHint: { marginTop: 4, fontSize: 11, fontWeight: '700', color: '#0284c7' },
  detailList: { gap: 8, paddingHorizontal: 14, paddingBottom: 14 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, backgroundColor: '#ffffff', padding: 12 },
  detailName: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  detailMeta: { marginTop: 3, fontSize: 11, color: '#64748b' },
  detailSubtotal: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  emptyText: { fontSize: 14, color: '#64748b', textAlign: 'center', paddingVertical: 10 },
})
