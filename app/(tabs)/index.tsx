import { api } from '@/constants/api'
import { useAuth } from '@/hooks/use-auth'
import type { InventoryResponse } from '@/lib/types'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

type DashboardStats = {
  products: number
  lowStock: number
  movements: number
  pieceProducts: number
  weightProducts: number
  todayEntries: number
}

type QuickAction = {
  label: string
  hint: string
  icon: keyof typeof Ionicons.glyphMap
  onPress: () => void
}

type DashboardRange = 'hoy' | 'semana' | 'mes'

type Sale = {
  id: number
  fecha: string
  total: number
  metodoPago: 'efectivo' | 'tarjeta' | 'transferencia'
  usuarioId: number
  detalles: Array<{
    id: number
    productoId: number
    nombre: string
    cantidad: number
    precio: number
    subtotal: number
  }>
}

type SalesResponse = {
  data: Sale[]
  stats: {
    dia: { totalVendido: number; cantidadVentas: number }
    semana: { totalVendido: number; cantidadVentas: number }
    mes: { totalVendido: number; cantidadVentas: number }
  }
}

type CashCut = {
  id: number
  fechaInicio: string
  fechaFin: string
  totalVentas: number
  totalEfectivo: number
  totalTarjeta: number
  totalTransferencia: number
  cantidadVentas: number
  createdAt: string
}

type CashCutResponse = {
  data: CashCut[]
}

export default function DashboardScreen() {
  const { session, signOut } = useAuth()
  const router = useRouter()
  const [stats, setStats] = useState<DashboardStats>({
    products: 0,
    lowStock: 0,
    movements: 0,
    pieceProducts: 0,
    weightProducts: 0,
    todayEntries: 0,
  })
  const [lowStockPreview, setLowStockPreview] = useState<Array<{ id: number; nombre: string; stock: number; tipo: 'pieza' | 'peso' }>>([])
  const [recentMovements, setRecentMovements] = useState<Array<{ id: number; nombre: string; tipo: 'entrada' | 'salida'; cantidad: number; fecha: string }>>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [latestCashCut, setLatestCashCut] = useState<CashCut | null>(null)
  const [range, setRange] = useState<DashboardRange>('hoy')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadDashboard = async () => {
      if (!session) return

      try {
        const inventoryPromise = api.get<InventoryResponse>('/inventario', {
          headers: { Authorization: `Bearer ${session.token}` },
        })
        const salesPromise = api.get<SalesResponse>('/ventas', {
          headers: { Authorization: `Bearer ${session.token}` },
        })
        const cashCutPromise = session.user.rol === 'admin'
          ? api.get<CashCutResponse>('/cortes-caja', {
              headers: { Authorization: `Bearer ${session.token}` },
            })
          : Promise.resolve(null)

        const [inventoryResponse, salesResponse, cashCutResponse] = await Promise.all([inventoryPromise, salesPromise, cashCutPromise])

        const products = inventoryResponse.data.items
        const movements = inventoryResponse.data.movements
        const lowStockProducts = products.filter((product) => product.stock <= (product.tipo_venta === 'peso' ? 3 : 10))
        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        const todayEntries = movements.filter((movement) => movement.tipo === 'entrada' && new Date(movement.fecha) >= todayStart).length
        const salesData = salesResponse.data.data

        setStats({
          products: products.length,
          lowStock: lowStockProducts.length,
          movements: movements.length,
          pieceProducts: products.filter((product) => product.tipo_venta === 'pieza').length,
          weightProducts: products.filter((product) => product.tipo_venta === 'peso').length,
          todayEntries,
        })
        setSales(salesData)

        setLowStockPreview(
          lowStockProducts.slice(0, 4).map((product) => ({
            id: product.id,
            nombre: product.nombre,
            stock: product.stock,
            tipo: product.tipo_venta,
          })),
        )

        setRecentMovements(
          movements.slice(0, 5).map((movement) => ({
            id: movement.id,
            nombre: products.find((product) => product.id === movement.productoId)?.nombre || `Producto #${movement.productoId}`,
            tipo: movement.tipo,
            cantidad: movement.cantidad,
            fecha: movement.fecha,
          })),
        )
        setLatestCashCut(cashCutResponse?.data.data?.[0] || null)
      } finally {
        setLoading(false)
      }
    }

    void loadDashboard()
  }, [session])

  const quickActions = useMemo<QuickAction[]>(
    () =>
      session?.user.rol === 'admin'
        ? [
            { label: 'Ver inventario', hint: 'Entradas y stock', icon: 'cube-outline' as const, onPress: () => void router.push('/(tabs)/inventario') },
            { label: 'Agregar producto', hint: 'Alta por codigo', icon: 'barcode-outline' as const, onPress: () => void router.push('/(tabs)/productos') },
            { label: 'Cerrar sesion', hint: 'Salir de la app', icon: 'log-out-outline' as const, onPress: () => void signOut() },
          ]
        : [
            { label: 'Registrar entrada', hint: 'Ir a inventario', icon: 'download-outline' as const, onPress: () => void router.push('/(tabs)/inventario') },
            { label: 'Revisar stock bajo', hint: 'Productos criticos', icon: 'alert-circle-outline' as const, onPress: () => void router.push('/(tabs)/inventario') },
            { label: 'Cerrar sesion', hint: 'Salir de la app', icon: 'log-out-outline' as const, onPress: () => void signOut() },
          ],
    [router, session?.user.rol, signOut],
  )

  const rangeStart = useMemo(() => {
    const now = new Date()
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)

    if (range === 'semana') {
      start.setDate(start.getDate() - 6)
    } else if (range === 'mes') {
      start.setDate(start.getDate() - 29)
    }

    return start
  }, [range])

  const rangedSales = useMemo(() => sales.filter((sale) => new Date(sale.fecha) >= rangeStart), [rangeStart, sales])

  const salesRangeSummary = useMemo(() => {
    return {
      total: rangedSales.reduce((sum, sale) => sum + sale.total, 0),
      count: rangedSales.length,
      efectivo: rangedSales.filter((sale) => sale.metodoPago === 'efectivo').reduce((sum, sale) => sum + sale.total, 0),
      tarjeta: rangedSales.filter((sale) => sale.metodoPago === 'tarjeta').reduce((sum, sale) => sum + sale.total, 0),
      transferencia: rangedSales.filter((sale) => sale.metodoPago === 'transferencia').reduce((sum, sale) => sum + sale.total, 0),
    }
  }, [rangedSales])

  const topSoldProducts = useMemo(() => {
    const productTotals = new Map<string, { nombre: string; cantidad: number; total: number }>()

    rangedSales.forEach((sale) => {
      sale.detalles.forEach((detail) => {
        const key = `${detail.productoId}-${detail.nombre}`
        const current = productTotals.get(key)
        if (current) {
          current.cantidad += detail.cantidad
          current.total += detail.subtotal
        } else {
          productTotals.set(key, {
            nombre: detail.nombre,
            cantidad: detail.cantidad,
            total: detail.subtotal,
          })
        }
      })
    })

    return Array.from(productTotals.values())
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 4)
  }, [rangedSales])

  const salesByDay = useMemo(() => {
    const buckets = new Map<string, number>()
    rangedSales.forEach((sale) => {
      const dateKey = new Date(sale.fecha).toLocaleDateString('es-MX', {
        month: 'short',
        day: 'numeric',
      })
      buckets.set(dateKey, Number(((buckets.get(dateKey) || 0) + sale.total).toFixed(2)))
    })

    const entries = Array.from(buckets.entries()).map(([label, total]) => ({ label, total }))
    if (entries.length === 0) return []
    return entries.slice(-7)
  }, [rangedSales])

  const paymentDistribution = useMemo(() => {
    const total = salesRangeSummary.total || 1
    return [
      {
        label: 'Efectivo',
        value: salesRangeSummary.efectivo,
        percent: (salesRangeSummary.efectivo / total) * 100,
        color: '#16a34a',
      },
      {
        label: 'Tarjeta',
        value: salesRangeSummary.tarjeta,
        percent: (salesRangeSummary.tarjeta / total) * 100,
        color: '#2563eb',
      },
      {
        label: 'Transferencia',
        value: salesRangeSummary.transferencia,
        percent: (salesRangeSummary.transferencia / total) * 100,
        color: '#7c3aed',
      },
    ]
  }, [salesRangeSummary])

  if (!session) return null

  const isAdmin = session.user.rol === 'admin'

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.heroCard}>
          <View style={styles.heroGlow} />
          <View style={styles.heroTop}>
            <View style={styles.userBadge}>
              <Ionicons name={isAdmin ? 'shield-checkmark-outline' : 'storefront-outline'} size={18} color="#0f766e" />
              <Text style={styles.userBadgeText}>{isAdmin ? 'Administrador' : 'Vendedor'}</Text>
            </View>
            <Pressable style={styles.heroLogout} onPress={() => void signOut()}>
              <Ionicons name="log-out-outline" size={16} color="#475569" />
            </Pressable>
          </View>

          <Text style={styles.heroTitle}>Hola, {session.user.nombre}</Text>
          <Text style={styles.heroSubtitle}>
            {isAdmin
              ? 'Resumen de operacion, alertas de stock y accesos de gestion desde movil.'
              : 'Panel rapido para revisar existencias y registrar entradas de almacen.'}
          </Text>

          <View style={styles.heroStatsRow}>
            <MiniMetric label="Productos" value={String(stats.products)} accent="#0369a1" />
            <MiniMetric label="Stock bajo" value={String(stats.lowStock)} accent="#b45309" />
            <MiniMetric label="Entradas hoy" value={String(stats.todayEntries)} accent="#15803d" />
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#0284c7" />
          </View>
        ) : (
          <>
            <View style={styles.grid}>
              <SummaryCard
                label="Productos por pieza"
                value={String(stats.pieceProducts)}
                hint="Listos para venta directa"
                tone="blue"
                icon="pricetag-outline"
              />
              <SummaryCard
                label="Productos a granel"
                value={String(stats.weightProducts)}
                hint="Control por peso"
                tone="green"
                icon="scale-outline"
              />
            </View>

            <View style={styles.grid}>
              <SummaryCard
                label="Movimientos del sistema"
                value={String(stats.movements)}
                hint="Actividad registrada"
                tone="amber"
                icon="swap-horizontal-outline"
              />
              <SummaryCard
                label="Entradas del dia"
                value={String(stats.todayEntries)}
                hint="Flujo de almacen"
                tone="teal"
                icon="arrow-down-circle-outline"
              />
            </View>

            {isAdmin ? (
              <>
                <View style={styles.grid}>
                  <SummaryCard
                    label={range === 'hoy' ? 'Ventas del dia' : range === 'semana' ? 'Ventas de 7 dias' : 'Ventas de 30 dias'}
                    value={`$${salesRangeSummary.total.toFixed(2)}`}
                    hint={`${salesRangeSummary.count} ventas`}
                    tone="rose"
                    icon="wallet-outline"
                  />
                  <SummaryCard
                    label="Ultimo corte"
                    value={latestCashCut ? `$${latestCashCut.totalVentas.toFixed(2)}` : '--'}
                    hint={latestCashCut ? `${latestCashCut.cantidadVentas} ventas` : 'Sin cortes'}
                    tone="slate"
                    icon="receipt-outline"
                  />
                </View>

                <View style={styles.panel}>
                  <Text style={styles.panelTitle}>Rango comercial</Text>
                  <View style={styles.rangeChips}>
                    {([
                      { key: 'hoy', label: 'Hoy' },
                      { key: 'semana', label: '7 dias' },
                      { key: 'mes', label: '30 dias' },
                    ] as const).map((option) => (
                      <Pressable key={option.key} style={[styles.rangeChip, range === option.key && styles.rangeChipActive]} onPress={() => setRange(option.key)}>
                        <Text style={[styles.rangeChipText, range === option.key && styles.rangeChipTextActive]}>{option.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.panel}>
                  <Text style={styles.panelTitle}>Metodos de pago</Text>
                  <View style={styles.paymentGrid}>
                    <PaymentCard label="Efectivo" value={salesRangeSummary.efectivo} color="#15803d" />
                    <PaymentCard label="Tarjeta" value={salesRangeSummary.tarjeta} color="#1d4ed8" />
                    <PaymentCard label="Transferencia" value={salesRangeSummary.transferencia} color="#7c3aed" />
                  </View>
                </View>

                <View style={styles.panel}>
                  <Text style={styles.panelTitle}>Ventas por dia</Text>
                  {salesByDay.length > 0 ? (
                    <View style={styles.chartCard}>
                      <View style={styles.barChart}>
                        {salesByDay.map((entry) => {
                          const max = Math.max(...salesByDay.map((item) => item.total), 1)
                          const height = Math.max((entry.total / max) * 120, 10)
                          return (
                            <View key={entry.label} style={styles.barColumn}>
                              <Text style={styles.barValue}>{`$${entry.total.toFixed(0)}`}</Text>
                              <View style={[styles.barFill, { height }]} />
                              <Text style={styles.barLabel}>{entry.label}</Text>
                            </View>
                          )
                        })}
                      </View>
                    </View>
                  ) : (
                    <Text style={styles.emptyText}>No hay ventas en el rango seleccionado.</Text>
                  )}
                </View>

                <View style={styles.panel}>
                  <Text style={styles.panelTitle}>Distribucion por pago</Text>
                  {paymentDistribution.some((item) => item.value > 0) ? (
                    <View style={styles.distributionList}>
                      {paymentDistribution.map((item) => (
                        <View key={item.label} style={styles.distributionRow}>
                          <View style={styles.distributionHeader}>
                            <View style={styles.distributionLabelWrap}>
                              <View style={[styles.distributionDot, { backgroundColor: item.color }]} />
                              <Text style={styles.distributionLabel}>{item.label}</Text>
                            </View>
                            <Text style={styles.distributionAmount}>{`$${item.value.toFixed(2)}`}</Text>
                          </View>
                          <View style={styles.distributionTrack}>
                            <View style={[styles.distributionBar, { width: `${Math.max(item.percent, item.value > 0 ? 8 : 0)}%`, backgroundColor: item.color }]} />
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.emptyText}>Aun no hay pagos registrados en este rango.</Text>
                  )}
                </View>
              </>
            ) : null}

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Acciones rapidas</Text>
              {!isAdmin ? (
                <Pressable style={styles.primaryActionBanner} onPress={() => router.push('/(tabs)/inventario')}>
                  <View style={styles.primaryActionIcon}>
                    <Ionicons name="download-outline" size={22} color="#ffffff" />
                  </View>
                  <View style={styles.primaryActionBody}>
                    <Text style={styles.primaryActionTitle}>Registrar entrada</Text>
                    <Text style={styles.primaryActionHint}>Ir directo a inventario para capturar stock de almacen</Text>
                  </View>
                </Pressable>
              ) : null}
              <View style={styles.actionsGrid}>
                {quickActions.map((action) => (
                  <Pressable key={action.label} style={styles.actionCard} onPress={action.onPress}>
                    <View style={styles.actionIcon}>
                      <Ionicons name={action.icon} size={20} color="#0369a1" />
                    </View>
                    <Text style={styles.actionTitle}>{action.label}</Text>
                    <Text style={styles.actionHint}>{action.hint}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Stock bajo</Text>
              {lowStockPreview.length > 0 ? (
                <View style={styles.alertList}>
                  {lowStockPreview.map((item) => (
                    <Pressable key={item.id} style={styles.alertRow} onPress={() => router.push('/(tabs)/inventario')}>
                      <View style={styles.alertDot} />
                      <View style={styles.alertBody}>
                        <Text style={styles.alertName}>{item.nombre}</Text>
                        <Text style={styles.alertMeta}>{item.tipo === 'peso' ? 'A granel' : 'Por pieza'}</Text>
                      </View>
                      <Text style={styles.alertStock}>{item.stock.toFixed(item.tipo === 'peso' ? 3 : 0)}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>No hay productos criticos por ahora.</Text>
              )}
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Movimientos recientes</Text>
              {recentMovements.length > 0 ? (
                <View style={styles.movementsList}>
                  {recentMovements.map((movement) => (
                    <Pressable key={movement.id} style={styles.movementRow} onPress={() => router.push('/(tabs)/inventario')}>
                      <View style={[styles.movementIcon, movement.tipo === 'entrada' ? styles.movementIconEntry : styles.movementIconExit]}>
                        <Ionicons
                          name={movement.tipo === 'entrada' ? 'arrow-down-outline' : 'arrow-up-outline'}
                          size={16}
                          color={movement.tipo === 'entrada' ? '#047857' : '#b91c1c'}
                        />
                      </View>
                      <View style={styles.movementBody}>
                        <Text style={styles.movementName}>{movement.nombre}</Text>
                        <Text style={styles.movementMeta}>{new Date(movement.fecha).toLocaleString()}</Text>
                      </View>
                      <Text style={styles.movementQty}>{movement.cantidad.toFixed(3)}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>No hay movimientos recientes.</Text>
              )}
            </View>

            {isAdmin ? (
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Top productos con salida</Text>
                {topSoldProducts.length > 0 ? (
                  <View style={styles.topList}>
                    {topSoldProducts.map((item, index) => (
                      <Pressable key={`${item.nombre}-${index}`} style={styles.topRow} onPress={() => router.push('/(tabs)/inventario')}>
                        <View style={styles.topIndex}>
                          <Text style={styles.topIndexText}>{index + 1}</Text>
                        </View>
                        <View style={styles.topBody}>
                          <Text style={styles.topName}>{item.nombre}</Text>
                          <Text style={styles.topMeta}>{item.cantidad.toFixed(3)} unidades / kg</Text>
                        </View>
                        <Text style={styles.topTotal}>${item.total.toFixed(2)}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.emptyText}>Aun no hay ventas suficientes para calcular destacados.</Text>
                )}
              </View>
            ) : null}

            {isAdmin ? (
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Alertas de stock</Text>
                <View style={styles.alertSummaryGrid}>
                  <View style={[styles.alertSummaryCard, styles.alertSummaryAmber]}>
                    <Text style={styles.alertSummaryValue}>{stats.lowStock}</Text>
                    <Text style={styles.alertSummaryLabel}>Productos criticos</Text>
                  </View>
                  <View style={[styles.alertSummaryCard, styles.alertSummaryBlue]}>
                    <Text style={styles.alertSummaryValue}>{lowStockPreview.filter((item) => item.tipo === 'pieza').length}</Text>
                    <Text style={styles.alertSummaryLabel}>Por pieza</Text>
                  </View>
                  <View style={[styles.alertSummaryCard, styles.alertSummaryGreen]}>
                    <Text style={styles.alertSummaryValue}>{lowStockPreview.filter((item) => item.tipo === 'peso').length}</Text>
                    <Text style={styles.alertSummaryLabel}>A granel</Text>
                  </View>
                </View>
                <Pressable style={styles.alertActionButton} onPress={() => router.push('/(tabs)/inventario')}>
                  <Ionicons name="alert-circle-outline" size={18} color="#92400e" />
                  <Text style={styles.alertActionText}>Revisar inventario critico</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function MiniMetric({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <View style={styles.miniMetric}>
      <Text style={[styles.miniMetricValue, { color: accent }]}>{value}</Text>
      <Text style={styles.miniMetricLabel}>{label}</Text>
    </View>
  )
}

function SummaryCard({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string
  value: string
  hint: string
  tone: 'blue' | 'green' | 'amber' | 'teal' | 'rose' | 'slate'
  icon: keyof typeof Ionicons.glyphMap
}) {
  const palette =
    tone === 'blue'
      ? { card: '#eff6ff', iconBg: '#dbeafe', icon: '#2563eb' }
      : tone === 'green'
        ? { card: '#ecfdf5', iconBg: '#d1fae5', icon: '#059669' }
        : tone === 'amber'
          ? { card: '#fffbeb', iconBg: '#fde68a', icon: '#b45309' }
          : tone === 'teal'
            ? { card: '#f0fdfa', iconBg: '#ccfbf1', icon: '#0f766e' }
            : tone === 'rose'
              ? { card: '#fff1f2', iconBg: '#ffe4e6', icon: '#e11d48' }
              : { card: '#f8fafc', iconBg: '#e2e8f0', icon: '#475569' }

  return (
    <View style={[styles.summaryCard, { backgroundColor: palette.card }]}>
      <View style={[styles.summaryIcon, { backgroundColor: palette.iconBg }]}>
        <Ionicons name={icon} size={18} color={palette.icon} />
      </View>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryHint}>{hint}</Text>
    </View>
  )
}

function PaymentCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.paymentCard}>
      <Text style={[styles.paymentValue, { color }]}>{`$${value.toFixed(2)}`}</Text>
      <Text style={styles.paymentLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f3f7fb' },
  container: { padding: 20, gap: 16 },
  heroCard: {
    overflow: 'hidden',
    borderRadius: 30,
    backgroundColor: '#ffffff',
    padding: 20,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  heroGlow: {
    position: 'absolute',
    right: -40,
    top: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#dbeafe',
    opacity: 0.55,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  userBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  userBadgeText: { color: '#0f766e', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  heroLogout: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  heroTitle: { marginTop: 18, fontSize: 28, fontWeight: '800', color: '#0f172a' },
  heroSubtitle: { marginTop: 8, fontSize: 14, lineHeight: 21, color: '#64748b', maxWidth: 290 },
  heroStatsRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  miniMetric: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  miniMetricValue: { fontSize: 24, fontWeight: '800' },
  miniMetricLabel: { marginTop: 4, fontSize: 11, fontWeight: '700', color: '#64748b', textAlign: 'center' },
  loadingCard: {
    borderRadius: 28,
    backgroundColor: '#ffffff',
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: { flexDirection: 'row', gap: 12 },
  summaryCard: {
    flex: 1,
    borderRadius: 26,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryValue: { marginTop: 12, fontSize: 28, fontWeight: '800', color: '#0f172a' },
  summaryLabel: { marginTop: 6, fontSize: 14, fontWeight: '700', color: '#0f172a', textAlign: 'center' },
  summaryHint: { marginTop: 4, fontSize: 12, color: '#64748b', textAlign: 'center' },
  panel: {
    borderRadius: 28,
    backgroundColor: '#ffffff',
    padding: 18,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  panelTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  primaryActionBanner: {
    marginTop: 14,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 24,
    backgroundColor: '#16a34a',
    padding: 16,
  },
  primaryActionIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  primaryActionBody: { flex: 1 },
  primaryActionTitle: { fontSize: 17, fontWeight: '800', color: '#ffffff' },
  primaryActionHint: { marginTop: 4, fontSize: 13, lineHeight: 18, color: 'rgba(255,255,255,0.88)' },
  rangeChips: { flexDirection: 'row', gap: 8, marginTop: 14 },
  rangeChip: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeChipActive: {
    backgroundColor: '#dbeafe',
  },
  rangeChipText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  rangeChipTextActive: { color: '#1d4ed8' },
  paymentGrid: { flexDirection: 'row', gap: 10, marginTop: 14 },
  paymentCard: {
    flex: 1,
    borderRadius: 22,
    backgroundColor: '#f8fafc',
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentValue: { fontSize: 20, fontWeight: '800' },
  paymentLabel: { marginTop: 6, fontSize: 12, fontWeight: '700', color: '#64748b', textAlign: 'center' },
  chartCard: {
    marginTop: 14,
    borderRadius: 22,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 170,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  barValue: { fontSize: 10, fontWeight: '700', color: '#64748b' },
  barFill: {
    width: '100%',
    maxWidth: 28,
    borderRadius: 999,
    backgroundColor: '#38bdf8',
  },
  barLabel: { fontSize: 10, fontWeight: '700', color: '#475569', textAlign: 'center' },
  distributionList: { gap: 12, marginTop: 14 },
  distributionRow: { gap: 8 },
  distributionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  distributionLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  distributionDot: { width: 10, height: 10, borderRadius: 5 },
  distributionLabel: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  distributionAmount: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  distributionTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
  },
  distributionBar: {
    height: '100%',
    borderRadius: 999,
  },
  actionsGrid: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionCard: {
    flex: 1,
    minHeight: 124,
    borderRadius: 22,
    backgroundColor: '#f8fafc',
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e0f2fe',
  },
  actionTitle: { marginTop: 12, fontSize: 14, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  actionHint: { marginTop: 4, fontSize: 12, color: '#64748b', textAlign: 'center' },
  alertList: { gap: 10, marginTop: 14 },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    backgroundColor: '#fff7ed',
    padding: 14,
  },
  alertDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#f59e0b',
  },
  alertBody: { flex: 1, minWidth: 0 },
  alertName: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  alertMeta: { marginTop: 3, fontSize: 12, color: '#92400e' },
  alertStock: { fontSize: 15, fontWeight: '800', color: '#b45309' },
  movementsList: { gap: 10, marginTop: 14 },
  movementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    padding: 14,
  },
  movementIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  movementIconEntry: { backgroundColor: '#dcfce7' },
  movementIconExit: { backgroundColor: '#fee2e2' },
  movementBody: { flex: 1, minWidth: 0 },
  movementName: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  movementMeta: { marginTop: 3, fontSize: 12, color: '#64748b' },
  movementQty: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  topList: { gap: 10, marginTop: 14 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    padding: 14,
  },
  topIndex: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dbeafe',
  },
  topIndexText: { fontSize: 13, fontWeight: '800', color: '#1d4ed8' },
  topBody: { flex: 1, minWidth: 0 },
  topName: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  topMeta: { marginTop: 3, fontSize: 12, color: '#64748b' },
  topTotal: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  emptyText: { marginTop: 14, fontSize: 14, color: '#64748b', textAlign: 'center' },
  alertSummaryGrid: { flexDirection: 'row', gap: 10, marginTop: 14 },
  alertSummaryCard: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertSummaryAmber: { backgroundColor: '#fffbeb' },
  alertSummaryBlue: { backgroundColor: '#eff6ff' },
  alertSummaryGreen: { backgroundColor: '#ecfdf5' },
  alertSummaryValue: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  alertSummaryLabel: { marginTop: 4, fontSize: 11, fontWeight: '700', color: '#475569', textAlign: 'center' },
  alertActionButton: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 18,
    backgroundColor: '#fef3c7',
    paddingVertical: 14,
  },
  alertActionText: { color: '#92400e', fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
})
