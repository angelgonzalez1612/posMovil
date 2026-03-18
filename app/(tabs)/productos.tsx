import { api } from '@/constants/api'
import { useAuth } from '@/hooks/use-auth'
import type { BarcodePdfResponse, Product, ProductLookupResult } from '@/lib/types'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as FileSystem from 'expo-file-system/legacy'
import { Redirect } from 'expo-router'
import * as Sharing from 'expo-sharing'
import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

type FormState = {
  nombre: string
  codigo_barras: string
  categoria: string
  precio: string
  tipo_venta: 'pieza' | 'peso'
}

type CreationMode = 'barcode' | 'manual'

const initialForm: FormState = {
  nombre: '',
  codigo_barras: '',
  categoria: '',
  precio: '',
  tipo_venta: 'pieza',
}

export default function ProductsScreen() {
  const { session } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [form, setForm] = useState<FormState>(initialForm)
  const [creationMode, setCreationMode] = useState<CreationMode>('barcode')
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('Todas')
  const [saleTypeFilter, setSaleTypeFilter] = useState<'todos' | 'pieza' | 'peso'>('todos')
  const [barcodeFilter, setBarcodeFilter] = useState<'todos' | 'interno' | 'comercial'>('todos')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerLocked, setScannerLocked] = useState(false)
  const [scannerTorch, setScannerTorch] = useState(false)
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([])
  const [pdfModal, setPdfModal] = useState<{ productIds: number[]; copies: string } | null>(null)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'info' | 'error' | 'success'>('info')
  const [permission, requestPermission] = useCameraPermissions()

  const loadProducts = async () => {
    if (!session) return

    setLoading(true)
    try {
      const response = await api.get<Product[]>('/productos', {
        headers: { Authorization: `Bearer ${session.token}` },
      })
      setProducts(response.data)
    } catch {
      setMessageTone('error')
      setMessage('No se pudieron cargar los productos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadProducts()
  }, [session])

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return products.filter((product) => {
      const matchesQuery = normalizedQuery
        ? [product.nombre, product.codigo_barras, product.categoria, product.marca, product.cantidad]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(normalizedQuery)
        : true
      const matchesCategory = categoryFilter === 'Todas' ? true : (product.categoria || 'General') === categoryFilter
      const matchesSaleType = saleTypeFilter === 'todos' ? true : product.tipo_venta === saleTypeFilter
      const isInternalBarcode = /^29\d{10}$/.test(product.codigo_barras)
      const matchesBarcodeType =
        barcodeFilter === 'todos'
          ? true
          : barcodeFilter === 'interno'
            ? isInternalBarcode
            : !isInternalBarcode
      return matchesQuery && matchesCategory && matchesSaleType && matchesBarcodeType
    })
  }, [barcodeFilter, categoryFilter, products, query, saleTypeFilter])
  const filteredInternalProducts = useMemo(() => filteredProducts.filter((product) => /^29\d{10}$/.test(product.codigo_barras)), [filteredProducts])

  const categories = useMemo(() => {
    const values = Array.from(new Set(products.map((product) => product.categoria).filter(Boolean) as string[]))
    return ['Todas', ...values.sort((a, b) => a.localeCompare(b))]
  }, [products])

  const pieceCount = products.filter((product) => product.tipo_venta === 'pieza').length
  const weightCount = products.filter((product) => product.tipo_venta === 'peso').length

  const buildNextInternalBarcode = () => {
    const internalBarcodes = products
      .map((product) => product.codigo_barras)
      .filter((barcode) => /^29\d{10}$/.test(barcode))
      .map((barcode) => Number(barcode.slice(2)))

    const nextSequence = (internalBarcodes.length ? Math.max(...internalBarcodes) : 0) + 1
    return `29${String(nextSequence).padStart(10, '0')}`
  }

  const lookupBarcode = async (barcode: string) => {
    if (!session || !barcode.trim()) return

    setLookupLoading(true)
    setMessage('')
    try {
      const response = await api.get<ProductLookupResult>(`/productos/lookup/${encodeURIComponent(barcode.trim())}`, {
        headers: { Authorization: `Bearer ${session.token}` },
      })

      setForm((current) => ({
        ...current,
        codigo_barras: response.data.codigo_barras || barcode.trim(),
        nombre: response.data.nombre || current.nombre,
        categoria: response.data.categoria || current.categoria,
        precio: response.data.precio > 0 ? String(response.data.precio) : current.precio,
        tipo_venta: 'pieza',
      }))

      if (response.data.existsInCatalog) {
        setMessageTone('info')
        setMessage('Ese codigo ya existe en tu catalogo. Puedes usarlo como referencia o revisar duplicados.')
      } else {
        setMessageTone('success')
        setMessage('Codigo detectado y datos listos.')
      }
    } catch {
      setForm((current) => ({ ...current, codigo_barras: barcode.trim() }))
      setMessageTone('error')
      setMessage('No se encontraron datos para ese codigo. Puedes capturarlo manualmente.')
    } finally {
      setLookupLoading(false)
    }
  }

  const openScanner = async () => {
    setMessage('')
    if (!permission?.granted) {
      const response = await requestPermission()
      if (!response.granted) {
        setMessageTone('error')
        setMessage('Necesitas permitir la camara para escanear codigos.')
        return
      }
    }

    setScannerLocked(false)
    setScannerTorch(false)
    setScannerOpen(true)
  }

  const handleGenerateBarcodePdf = async (productIds: number[], copies: number) => {
    if (!session) return

    try {
      const response = await api.post<BarcodePdfResponse>(
        '/productos/barcodes/pdf',
        { productIds, copies },
        { headers: { Authorization: `Bearer ${session.token}` } },
      )

      const fileUri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}${response.data.filename}`
      await FileSystem.writeAsStringAsync(fileUri, response.data.contentBase64, {
        encoding: FileSystem.EncodingType.Base64,
      })

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Codigo de barras',
        })
      } else {
        setMessageTone('success')
        setMessage(`PDF generado en ${fileUri}`)
      }
    } catch {
      setMessageTone('error')
      setMessage('No se pudo generar el PDF del codigo.')
    }
  }

  if (!session) return null
  if (session.user.rol !== 'admin') {
    return <Redirect href="/(tabs)" />
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.heroCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>Catalogo movil</Text>
            <Text style={styles.title}>Registrar producto por codigo</Text>
            <Text style={styles.subtitle}>Abre la camara, lee el codigo de barras y dispara la busqueda automatica como en la web.</Text>
          </View>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{products.length}</Text>
            <Text style={styles.heroStatLabel}>productos</Text>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, styles.metricCardBlue]}>
            <Text style={styles.metricValue}>{products.length}</Text>
            <Text style={styles.metricLabel}>Catalogo total</Text>
          </View>
          <View style={[styles.metricCard, styles.metricCardGreen]}>
            <Text style={styles.metricValue}>{pieceCount}</Text>
            <Text style={styles.metricLabel}>Por pieza</Text>
          </View>
          <View style={[styles.metricCard, styles.metricCardAmber]}>
            <Text style={styles.metricValue}>{weightCount}</Text>
            <Text style={styles.metricLabel}>A granel</Text>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Nuevo producto</Text>
          <Text style={styles.sectionHint}>
            {creationMode === 'barcode'
              ? 'Escanea el codigo o capturalo manualmente. La consulta se hace automaticamente.'
              : 'Crea un producto manual y se genera un codigo interno como en la web.'}
          </Text>

          <View style={styles.creationModeRow}>
            {([
              { key: 'barcode', label: 'Codigo de barras' },
              { key: 'manual', label: 'Nuevo sin codigo' },
            ] as const).map((mode) => (
              <Pressable
                key={mode.key}
                style={[styles.creationModeChip, creationMode === mode.key && styles.creationModeChipActive]}
                onPress={() => {
                  setCreationMode(mode.key)
                  setForm({
                    ...initialForm,
                    tipo_venta: mode.key === 'manual' ? form.tipo_venta : 'pieza',
                  })
                  setMessage('')
                }}>
                <Text style={[styles.creationModeChipText, creationMode === mode.key && styles.creationModeChipTextActive]}>{mode.label}</Text>
              </Pressable>
            ))}
          </View>

          {creationMode === 'barcode' ? (
            <>
              <View style={styles.scanCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.scanLabel}>Codigo de barras</Text>
                  <Text style={styles.scanValue}>{form.codigo_barras || 'Aun no escaneado'}</Text>
                </View>
                <View style={styles.scanActions}>
                  <Pressable style={styles.scanButton} onPress={() => void openScanner()}>
                    <Text style={styles.scanButtonText}>Abrir camara</Text>
                  </Pressable>
                </View>
              </View>

              <TextInput
                value={form.codigo_barras}
                onChangeText={(value) => setForm((current) => ({ ...initialForm, codigo_barras: value, tipo_venta: 'pieza' }))}
                onEndEditing={() => {
                  if (form.codigo_barras.trim()) {
                    void lookupBarcode(form.codigo_barras)
                  }
                }}
                placeholder="Codigo de barras"
                style={styles.input}
              />
              <TextInput value={form.nombre} onChangeText={(value) => setForm((current) => ({ ...current, nombre: value }))} placeholder="Nombre del producto" style={styles.input} />
              <TextInput value={form.categoria} onChangeText={(value) => setForm((current) => ({ ...current, categoria: value }))} placeholder="Categoria" style={styles.input} />
              <TextInput value={form.precio} onChangeText={(value) => setForm((current) => ({ ...current, precio: value }))} placeholder="Precio" keyboardType="numeric" style={styles.input} />
            </>
          ) : (
            <>
              <View style={styles.manualInfoCard}>
                <Text style={styles.manualInfoText}>Se generara un codigo interno automaticamente para este producto.</Text>
              </View>
              <View style={styles.saleTypeRow}>
                {([
                  { key: 'pieza', label: 'Por pieza' },
                  { key: 'peso', label: 'A granel' },
                ] as const).map((type) => (
                  <Pressable
                    key={type.key}
                    style={[styles.saleTypeChip, form.tipo_venta === type.key && styles.saleTypeChipActive]}
                    onPress={() => setForm((current) => ({ ...current, tipo_venta: type.key }))}>
                    <Text style={[styles.saleTypeChipText, form.tipo_venta === type.key && styles.saleTypeChipTextActive]}>{type.label}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput value={form.nombre} onChangeText={(value) => setForm((current) => ({ ...current, nombre: value }))} placeholder="Nombre del producto" style={styles.input} />
              <TextInput value={form.categoria} onChangeText={(value) => setForm((current) => ({ ...current, categoria: value }))} placeholder="Categoria" style={styles.input} />
              <TextInput
                value={form.precio}
                onChangeText={(value) => setForm((current) => ({ ...current, precio: value }))}
                placeholder={form.tipo_venta === 'peso' ? 'Precio por kilo' : 'Precio'}
                keyboardType="numeric"
                style={styles.input}
              />
            </>
          )}

          {message ? <Text style={[styles.message, messageTone === 'error' ? styles.messageError : messageTone === 'success' ? styles.messageSuccess : null]}>{message}</Text> : null}

          <Pressable
            style={[styles.primaryButton, (saving || lookupLoading) && styles.buttonDisabled]}
            disabled={
              saving ||
              lookupLoading ||
              !form.nombre.trim() ||
              !form.precio.trim() ||
              (creationMode === 'barcode' && !form.codigo_barras.trim())
            }
            onPress={async () => {
              setSaving(true)
              setMessage('')
              try {
                const barcodeToSave = creationMode === 'manual' ? buildNextInternalBarcode() : form.codigo_barras.trim()
                const response = await api.post<Product>(
                  '/productos',
                  {
                    nombre: form.nombre.trim(),
                    codigo_barras: barcodeToSave,
                    categoria: form.categoria.trim(),
                    precio: Number(form.precio),
                    tipo_venta: creationMode === 'manual' ? form.tipo_venta : 'pieza',
                    stock: 0,
                  },
                  { headers: { Authorization: `Bearer ${session.token}` } },
                )
                setProducts((current) => [response.data, ...current])
                setForm(initialForm)
                setMessageTone('success')
                setMessage('Producto guardado correctamente.')
              } catch {
                setMessageTone('error')
                setMessage('No se pudo crear el producto. Revisa codigo o conexion.')
              } finally {
                setSaving(false)
              }
            }}>
            {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Guardar producto</Text>}
          </Pressable>
        </View>

          <View style={styles.panel}>
          <View style={styles.sectionHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Lista de productos</Text>
              <Text style={styles.sectionHint}>Busca por nombre, codigo, categoria o marca.</Text>
            </View>
            <Pressable style={styles.refreshButton} onPress={() => void loadProducts()}>
              <Text style={styles.refreshButtonText}>Actualizar</Text>
            </Pressable>
          </View>

          <View style={styles.infoBanner}>
            <Text style={styles.infoBannerText}>
              El boton PDF codigo solo aparece en productos con codigo interno del sistema 29... Usa el filtro Interno para verlos rapido.
            </Text>
          </View>

          <View style={styles.batchCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.batchTitle}>Etiquetas por lote</Text>
              <Text style={styles.batchHint}>{selectedProductIds.length} seleccionados para imprimir.</Text>
            </View>
            <View style={styles.batchActions}>
              <Pressable
                style={styles.batchGhostButton}
                onPress={() => setSelectedProductIds(filteredInternalProducts.map((product) => product.id))}>
                <Text style={styles.batchGhostButtonText}>Seleccionar visibles</Text>
              </Pressable>
              <Pressable style={styles.batchGhostButton} onPress={() => setSelectedProductIds([])}>
                <Text style={styles.batchGhostButtonText}>Limpiar</Text>
              </Pressable>
              <Pressable
                style={[styles.batchPrimaryButton, selectedProductIds.length === 0 && styles.buttonDisabled]}
                disabled={selectedProductIds.length === 0}
                onPress={() => setPdfModal({ productIds: selectedProductIds, copies: '1' })}>
                <Text style={styles.batchPrimaryButtonText}>Generar PDF</Text>
              </Pressable>
            </View>
          </View>

          <TextInput value={query} onChangeText={setQuery} placeholder="Buscar producto..." style={styles.input} />
          <View style={styles.filterModeRow}>
            {([
              { key: 'todos', label: 'Todos' },
              { key: 'pieza', label: 'Pieza' },
              { key: 'peso', label: 'A granel' },
            ] as const).map((type) => (
              <Pressable key={type.key} style={[styles.filterModeChip, saleTypeFilter === type.key && styles.filterModeChipActive]} onPress={() => setSaleTypeFilter(type.key)}>
                <Text style={[styles.filterModeChipText, saleTypeFilter === type.key && styles.filterModeChipTextActive]}>{type.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.filterModeRow}>
            {([
              { key: 'todos', label: 'Todos los codigos' },
              { key: 'interno', label: 'Interno' },
              { key: 'comercial', label: 'Comercial' },
            ] as const).map((type) => (
              <Pressable key={type.key} style={[styles.filterModeChip, barcodeFilter === type.key && styles.filterModeChipActive]} onPress={() => setBarcodeFilter(type.key)}>
                <Text style={[styles.filterModeChipText, barcodeFilter === type.key && styles.filterModeChipTextActive]}>{type.label}</Text>
              </Pressable>
            ))}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {categories.map((category) => (
              <Pressable key={category} style={[styles.filterChip, categoryFilter === category && styles.filterChipActive]} onPress={() => setCategoryFilter(category)}>
                <Text style={[styles.filterChipText, categoryFilter === category && styles.filterChipTextActive]}>{category}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {loading ? <ActivityIndicator color="#0284c7" style={{ marginTop: 12 }} /> : null}

          <View style={styles.list}>
            {filteredProducts.map((product) => (
              <View key={product.id} style={styles.productCard}>
                <View style={styles.productBadge}>
                  <Text style={styles.productBadgeText}>{product.nombre.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={styles.productBody}>
                  {/^29\d{10}$/.test(product.codigo_barras) ? (
                    <Pressable
                      style={[styles.checkboxRow, selectedProductIds.includes(product.id) && styles.checkboxRowActive]}
                      onPress={() =>
                        setSelectedProductIds((current) =>
                          current.includes(product.id) ? current.filter((id) => id !== product.id) : [...current, product.id],
                        )
                      }>
                      <View style={[styles.checkboxIndicator, selectedProductIds.includes(product.id) && styles.checkboxIndicatorActive]}>
                        {selectedProductIds.includes(product.id) ? <Text style={styles.checkboxIndicatorMark}>✓</Text> : null}
                      </View>
                      <Text style={[styles.checkboxLabel, selectedProductIds.includes(product.id) && styles.checkboxLabelActive]}>Seleccionar etiqueta</Text>
                    </Pressable>
                  ) : null}
                  <Text style={styles.productName}>{product.nombre}</Text>
                  <Text style={styles.productMeta}>{product.codigo_barras}</Text>
                <View style={styles.productMetaRow}>
                  <View style={styles.categoryBadge}>
                      <Text style={styles.categoryBadgeText}>{product.categoria || 'General'}</Text>
                  </View>
                  <View style={[styles.typeBadge, product.tipo_venta === 'peso' && styles.typeBadgeWeight]}>
                      <Text style={[styles.typeBadgeText, product.tipo_venta === 'peso' && styles.typeBadgeTextWeight]}>
                        {product.tipo_venta === 'peso' ? 'A granel' : 'Por pieza'}
                      </Text>
                    </View>
                    <View style={[styles.codeBadge, /^29\d{10}$/.test(product.codigo_barras) ? styles.codeBadgeInternal : styles.codeBadgeCommercial]}>
                      <Text style={[styles.codeBadgeText, /^29\d{10}$/.test(product.codigo_barras) ? styles.codeBadgeTextInternal : styles.codeBadgeTextCommercial]}>
                        {/^29\d{10}$/.test(product.codigo_barras) ? 'Interno' : 'Comercial'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.productPrice}>${product.precio.toFixed(2)}</Text>
                  {/^29\d{10}$/.test(product.codigo_barras) ? (
                    <Pressable style={styles.pdfButton} onPress={() => setPdfModal({ productIds: [product.id], copies: '1' })}>
                      <Text style={styles.pdfButtonText}>PDF codigo</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
            {!loading && filteredProducts.length === 0 ? <Text style={styles.emptyText}>No hay productos que coincidan con la busqueda.</Text> : null}
          </View>
        </View>
      </ScrollView>

      <Modal visible={scannerOpen} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderTextBlock}>
              <Text style={styles.modalEyebrow}>Escaner</Text>
              <Text style={styles.modalTitle}>Leer codigo de barras</Text>
            </View>
            <View style={styles.modalHeaderActions}>
              <Pressable style={styles.flashButton} onPress={() => setScannerTorch((current) => !current)}>
                <Text style={styles.flashButtonText}>{scannerTorch ? 'Flash encendido' : 'Flash apagado'}</Text>
              </Pressable>
              <Pressable
                style={styles.modalCloseButton}
                onPress={() => {
                  setScannerOpen(false)
                  setScannerLocked(false)
                  setScannerTorch(false)
                }}>
                <Text style={styles.modalCloseText}>Cerrar</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.cameraFrame}>
            <CameraView
              style={StyleSheet.absoluteFill}
              enableTorch={scannerTorch}
              barcodeScannerSettings={{
                barcodeTypes: ['ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e'],
              }}
              onBarcodeScanned={
                scannerLocked
                  ? undefined
                  : ({ data }) => {
                      if (!data) return
                      setScannerLocked(true)
                      setForm((current) => ({ ...current, codigo_barras: data }))
                      setScannerOpen(false)
                      setScannerTorch(false)
                      void lookupBarcode(data)
                    }
              }
            />
            <View style={styles.cameraOverlay}>
              <View style={styles.scanGuide} />
            </View>
          </View>

          <Text style={styles.modalHint}>Coloca el codigo dentro del recuadro. Al detectarlo se dispara la busqueda automaticamente.</Text>
        </SafeAreaView>
      </Modal>

      <Modal visible={!!pdfModal} transparent animationType="fade" onRequestClose={() => setPdfModal(null)}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogEyebrow}>Etiquetas</Text>
            <Text style={styles.dialogTitle}>Generar PDF de codigos</Text>
            <Text style={styles.dialogText}>
              Se generaran etiquetas para {pdfModal?.productIds.length || 0} producto(s).
            </Text>
            <TextInput
              value={pdfModal?.copies || '1'}
              onChangeText={(value) => setPdfModal((current) => (current ? { ...current, copies: value } : current))}
              placeholder="Copias por producto"
              keyboardType="numeric"
              style={styles.input}
            />
            <View style={styles.dialogActions}>
              <Pressable style={styles.dialogGhostButton} onPress={() => setPdfModal(null)}>
                <Text style={styles.dialogGhostButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={styles.dialogPrimaryButton}
                onPress={() => {
                  if (!pdfModal) return
                  const copies = Math.min(Math.max(Number(pdfModal.copies) || 1, 1), 50)
                  void handleGenerateBarcodePdf(pdfModal.productIds, copies)
                  setPdfModal(null)
                }}>
                <Text style={styles.dialogPrimaryButtonText}>Generar PDF</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f3f7fb' },
  container: { padding: 20, gap: 18 },
  heroCard: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'stretch',
    borderRadius: 28,
    backgroundColor: '#ffffff',
    padding: 20,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  eyebrow: { color: '#0284c7', fontSize: 12, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  title: { marginTop: 8, fontSize: 28, fontWeight: '800', color: '#0f172a' },
  subtitle: { marginTop: 8, fontSize: 14, lineHeight: 20, color: '#64748b' },
  heroStat: {
    minWidth: 94,
    borderRadius: 24,
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroStatValue: { fontSize: 28, fontWeight: '800', color: '#0369a1' },
  heroStatLabel: { marginTop: 2, fontSize: 12, fontWeight: '700', color: '#0369a1', textTransform: 'uppercase', letterSpacing: 1 },
  metricsRow: { flexDirection: 'row', gap: 10 },
  metricCard: { flex: 1, borderRadius: 22, paddingVertical: 16, paddingHorizontal: 10, alignItems: 'center' },
  metricCardBlue: { backgroundColor: '#e0f2fe' },
  metricCardGreen: { backgroundColor: '#dcfce7' },
  metricCardAmber: { backgroundColor: '#fef3c7' },
  metricValue: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  metricLabel: { marginTop: 4, fontSize: 11, fontWeight: '700', color: '#475569', textAlign: 'center' },
  panel: {
    borderRadius: 28,
    backgroundColor: '#ffffff',
    padding: 18,
    gap: 14,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  sectionTitle: { fontSize: 19, fontWeight: '800', color: '#0f172a' },
  sectionHint: { fontSize: 13, color: '#64748b' },
  infoBanner: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  infoBannerText: { color: '#15803d', fontSize: 12, fontWeight: '600', lineHeight: 18, textAlign: 'center' },
  batchCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dbe4ee',
    backgroundColor: '#f8fafc',
    padding: 14,
    gap: 12,
  },
  batchTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  batchHint: { marginTop: 4, fontSize: 12, color: '#64748b', textAlign: 'center' },
  batchActions: { gap: 8 },
  batchGhostButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    paddingVertical: 11,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  batchGhostButtonText: { color: '#475569', fontSize: 13, fontWeight: '700' },
  batchPrimaryButton: {
    borderRadius: 14,
    backgroundColor: '#16a34a',
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  batchPrimaryButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
  creationModeRow: { flexDirection: 'row', gap: 8 },
  creationModeChip: { flex: 1, borderRadius: 16, backgroundColor: '#e2e8f0', paddingVertical: 12, alignItems: 'center' },
  creationModeChipActive: { backgroundColor: '#dbeafe' },
  creationModeChipText: { color: '#475569', fontSize: 13, fontWeight: '700' },
  creationModeChipTextActive: { color: '#1d4ed8' },
  filterModeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  filterModeChip: { borderRadius: 16, backgroundColor: '#e2e8f0', paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' },
  filterModeChipActive: { backgroundColor: '#dbeafe' },
  filterModeChipText: { color: '#475569', fontSize: 12, fontWeight: '700' },
  filterModeChipTextActive: { color: '#1d4ed8' },
  filterRow: { gap: 8, paddingRight: 8 },
  filterChip: { borderRadius: 999, borderWidth: 1, borderColor: '#dbeafe', backgroundColor: '#eff6ff', paddingHorizontal: 12, paddingVertical: 8 },
  filterChipActive: { borderColor: '#0284c7', backgroundColor: '#0284c7' },
  filterChipText: { color: '#0369a1', fontSize: 12, fontWeight: '700' },
  filterChipTextActive: { color: '#ffffff' },
  scanCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    borderRadius: 22,
    backgroundColor: '#f8fafc',
    padding: 14,
  },
  scanActions: { gap: 8 },
  scanLabel: { fontSize: 12, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 },
  scanValue: { marginTop: 6, fontSize: 16, fontWeight: '800', color: '#0f172a' },
  scanButton: {
    borderRadius: 16,
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  scanButtonText: { color: '#075985', fontSize: 14, fontWeight: '700' },
  scanGhostButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  scanGhostButtonText: { color: '#475569', fontSize: 13, fontWeight: '700' },
  manualInfoCard: { borderRadius: 18, backgroundColor: '#f8fafc', paddingHorizontal: 14, paddingVertical: 12 },
  manualInfoText: { fontSize: 13, color: '#475569', textAlign: 'center' },
  saleTypeRow: { flexDirection: 'row', gap: 8 },
  saleTypeChip: { flex: 1, borderRadius: 16, backgroundColor: '#e2e8f0', paddingVertical: 12, alignItems: 'center' },
  saleTypeChipActive: { backgroundColor: '#dcfce7' },
  saleTypeChipText: { color: '#475569', fontSize: 13, fontWeight: '700' },
  saleTypeChipTextActive: { color: '#15803d' },
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
  message: { fontSize: 14, color: '#0369a1' },
  messageError: { color: '#b91c1c' },
  messageSuccess: { color: '#15803d' },
  primaryButton: { alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#16a34a', paddingVertical: 16 },
  primaryButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  refreshButton: { borderRadius: 16, backgroundColor: '#eef6ff', paddingHorizontal: 14, paddingVertical: 10 },
  refreshButtonText: { color: '#0369a1', fontWeight: '700', fontSize: 13 },
  buttonDisabled: { opacity: 0.6 },
  list: { gap: 12 },
  productCard: { flexDirection: 'row', gap: 12, borderRadius: 20, backgroundColor: '#f8fafc', padding: 12, alignItems: 'center' },
  productBadge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dbeafe',
  },
  productBadgeText: { fontSize: 20, fontWeight: '800', color: '#1d4ed8' },
  productBody: { flex: 1, gap: 4, justifyContent: 'center' },
  checkboxRow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 4,
  },
  checkboxRowActive: { backgroundColor: '#ecfdf5' },
  checkboxIndicator: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#86efac',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  checkboxIndicatorActive: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  checkboxIndicatorMark: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
  checkboxLabel: { color: '#15803d', fontSize: 11, fontWeight: '700' },
  checkboxLabelActive: { color: '#166534' },
  productName: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  productMeta: { fontSize: 12, color: '#64748b' },
  productMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  categoryBadge: { borderRadius: 999, backgroundColor: '#e2e8f0', paddingHorizontal: 10, paddingVertical: 6 },
  categoryBadgeText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  typeBadge: { borderRadius: 999, backgroundColor: '#dbeafe', paddingHorizontal: 10, paddingVertical: 6 },
  typeBadgeWeight: { backgroundColor: '#dcfce7' },
  typeBadgeText: { fontSize: 11, fontWeight: '700', color: '#1d4ed8' },
  typeBadgeTextWeight: { color: '#15803d' },
  codeBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  codeBadgeInternal: { backgroundColor: '#ecfdf5' },
  codeBadgeCommercial: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0' },
  codeBadgeText: { fontSize: 11, fontWeight: '700' },
  codeBadgeTextInternal: { color: '#15803d' },
  codeBadgeTextCommercial: { color: '#64748b' },
  productPrice: { marginTop: 4, fontSize: 15, fontWeight: '800', color: '#0f172a' },
  pdfButton: { marginTop: 8, alignSelf: 'flex-start', borderRadius: 14, backgroundColor: '#ecfdf5', paddingHorizontal: 12, paddingVertical: 8 },
  pdfButtonText: { color: '#15803d', fontSize: 12, fontWeight: '800' },
  emptyText: { fontSize: 14, color: '#64748b', textAlign: 'center', paddingVertical: 10 },
  modalSafeArea: { flex: 1, backgroundColor: '#0f172a' },
  modalHeader: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 18, gap: 12 },
  modalHeaderTextBlock: { width: '100%' },
  modalHeaderActions: { flexDirection: 'row', gap: 8, width: '100%' },
  modalEyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase', color: '#7dd3fc' },
  modalTitle: { marginTop: 6, fontSize: 28, fontWeight: '800', color: '#ffffff', flexShrink: 1 },
  flashButton: { flex: 1, borderRadius: 16, backgroundColor: '#fde68a', paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  flashButtonText: { color: '#92400e', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  modalCloseButton: { flex: 1, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  modalCloseText: { color: '#ffffff', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  cameraFrame: {
    marginHorizontal: 20,
    flex: 1,
    overflow: 'hidden',
    borderRadius: 28,
    backgroundColor: '#020617',
  },
  cameraOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.12)',
  },
  scanGuide: {
    width: '82%',
    height: 150,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: '#7dd3fc',
    backgroundColor: 'transparent',
  },
  modalHint: { padding: 20, textAlign: 'center', color: '#cbd5e1', fontSize: 14, lineHeight: 20 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  dialog: {
    width: '100%',
    borderRadius: 28,
    backgroundColor: '#ffffff',
    padding: 20,
    gap: 12,
  },
  dialogEyebrow: { color: '#94a3b8', fontSize: 12, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  dialogTitle: { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  dialogText: { fontSize: 14, lineHeight: 20, color: '#64748b' },
  dialogActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  dialogGhostButton: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: '#e2e8f0',
    paddingVertical: 14,
    alignItems: 'center',
  },
  dialogGhostButtonText: { color: '#475569', fontSize: 13, fontWeight: '700' },
  dialogPrimaryButton: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    alignItems: 'center',
  },
  dialogPrimaryButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
})

