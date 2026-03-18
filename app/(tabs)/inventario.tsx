import { api } from '@/constants/api'
import { useAuth } from '@/hooks/use-auth'
import type { InventoryResponse, Product, ProductLookupResult } from '@/lib/types'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { Image } from 'expo-image'
import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

type SaleTypeFilter = 'todos' | 'pieza' | 'peso'
type CreationMode = 'barcode' | 'manual'

export default function InventoryScreen() {
  const { session } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [filter, setFilter] = useState('')
  const [saleTypeFilter, setSaleTypeFilter] = useState<SaleTypeFilter>('todos')
  const [categoryFilter, setCategoryFilter] = useState('todas')
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null)
  const [quantity, setQuantity] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [captureModalOpen, setCaptureModalOpen] = useState(false)
  const [newProductModalOpen, setNewProductModalOpen] = useState(false)
  const [newProductMode, setNewProductMode] = useState<CreationMode>('barcode')
  const [newProductSaving, setNewProductSaving] = useState(false)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false)
  const [barcodeScannerLocked, setBarcodeScannerLocked] = useState(false)
  const [barcodeScannerTorch, setBarcodeScannerTorch] = useState(false)
  const [newProductForm, setNewProductForm] = useState({
    nombre: '',
    codigo_barras: '',
    categoria: '',
    precio: '',
    cantidadInicial: '',
    tipo_venta: 'pieza' as 'pieza' | 'peso',
  })
  const [message, setMessage] = useState('')
  const [cameraPermission, requestCameraPermission] = useCameraPermissions()

  const loadInventory = async () => {
    if (!session) return

    try {
      const response = await api.get<InventoryResponse>('/inventario', {
        headers: { Authorization: `Bearer ${session.token}` },
      })
      setProducts(response.data.items)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadInventory()
  }, [session])

  const categories = useMemo(() => {
    const dynamicCategories = products
      .map((product) => product.categoria?.trim())
      .filter((category): category is string => Boolean(category))

    return ['todas', ...Array.from(new Set(dynamicCategories)).sort()]
  }, [products])

  const filteredProducts = useMemo(() => {
    const query = filter.trim().toLowerCase()
    return products.filter((product) => {
      const matchesQuery = query
        ? [product.nombre, product.codigo_barras, product.categoria, product.marca, product.cantidad]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(query)
        : true
      const matchesType = saleTypeFilter === 'todos' ? true : product.tipo_venta === saleTypeFilter
      const matchesCategory = categoryFilter === 'todas' ? true : (product.categoria || '').trim() === categoryFilter
      return matchesQuery && matchesType && matchesCategory
    })
  }, [categoryFilter, filter, products, saleTypeFilter])

  const selectedProduct = products.find((product) => product.id === selectedProductId) || null

  const buildNextInternalBarcode = () => {
    const internalBarcodes = products
      .map((product) => product.codigo_barras)
      .filter((barcode) => /^29\d{10}$/.test(barcode))
      .map((barcode) => Number(barcode.slice(2)))

    const nextSequence = (internalBarcodes.length ? Math.max(...internalBarcodes) : 0) + 1
    return `29${String(nextSequence).padStart(10, '0')}`
  }

  const openCaptureModal = (productId: number) => {
    setSelectedProductId(productId)
    setQuantity('')
    setMessage('')
    setCaptureModalOpen(true)
  }

  const lookupBarcodeForNewProduct = async (barcode: string) => {
    if (!session || !barcode.trim()) return

    setLookupLoading(true)
    setMessage('')
    try {
      const response = await api.get<ProductLookupResult>(`/productos/lookup/${encodeURIComponent(barcode.trim())}`, {
        headers: { Authorization: `Bearer ${session.token}` },
      })

      const localProduct = products.find((product) => product.codigo_barras === response.data.codigo_barras || product.id === response.data.id)

      if (response.data.existsInCatalog && localProduct) {
        setNewProductModalOpen(false)
        openCaptureModal(localProduct.id)
        setMessage(`Ese codigo ya existe en catalogo: ${localProduct.nombre}`)
        return
      }

      setNewProductForm((current) => ({
        ...current,
        codigo_barras: response.data.codigo_barras || barcode.trim(),
        nombre: response.data.nombre || current.nombre,
        categoria: response.data.categoria || current.categoria,
        precio: response.data.precio > 0 ? String(response.data.precio) : current.precio,
        tipo_venta: 'pieza',
      }))
      setMessage('Codigo detectado y datos listos.')
    } catch {
      setNewProductForm((current) => ({ ...current, codigo_barras: barcode.trim() }))
      setMessage('No se encontraron datos para ese codigo. Puedes capturarlo manualmente.')
    } finally {
      setLookupLoading(false)
    }
  }

  const openBarcodeScanner = async () => {
    setMessage('')
    if (!cameraPermission?.granted) {
      const response = await requestCameraPermission()
      if (!response.granted) {
        setMessage('Necesitas permitir la camara para escanear el codigo de barras.')
        return
      }
    }

    setBarcodeScannerLocked(false)
    setBarcodeScannerTorch(false)
    setBarcodeScannerOpen(true)
  }

  if (!session) return null

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.heroCard}>
          <View style={styles.heroContent}>
            <Text style={styles.eyebrow}>Inventario movil</Text>
            <Text style={styles.title}>Entradas de almacen</Text>
            <Text style={styles.subtitle}>Filtra rapido la lista y abre una captura puntual por producto para registrar entradas sin ruido.</Text>
          </View>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeValue}>{filteredProducts.length}</Text>
            <Text style={styles.heroBadgeLabel}>visibles</Text>
          </View>
        </View>

        <View style={styles.filterPanel}>
          <TextInput value={filter} onChangeText={setFilter} placeholder="Buscar por nombre, codigo, marca o categoria" style={styles.searchInput} />

          <View style={styles.chipsGroup}>
            {(['todos', 'pieza', 'peso'] as const).map((value) => (
              <Pressable key={value} onPress={() => setSaleTypeFilter(value)} style={[styles.chip, saleTypeFilter === value && styles.chipActive]}>
                <Text style={[styles.chipText, saleTypeFilter === value && styles.chipTextActive]}>
                  {value === 'todos' ? 'Todos' : value === 'pieza' ? 'Por pieza' : 'A granel'}
                </Text>
              </Pressable>
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
            {categories.map((category) => (
              <Pressable key={category} onPress={() => setCategoryFilter(category)} style={[styles.categoryPill, categoryFilter === category && styles.categoryPillActive]}>
                <Text style={[styles.categoryPillText, categoryFilter === category && styles.categoryPillTextActive]}>
                  {category === 'todas' ? 'Todas las categorias' : category}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.panel}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionHeaderTextBlock}>
              <Text style={styles.sectionTitle}>Productos</Text>
              <Text style={styles.sectionHint}>Toca un producto para abrir la captura en modal.</Text>
            </View>
            <View style={styles.headerActions}>
              <Pressable style={styles.secondaryActionButton} onPress={() => setNewProductModalOpen(true)}>
                <Text style={styles.secondaryActionText}>Nuevo producto</Text>
              </Pressable>
              <Pressable style={styles.refreshButton} onPress={() => void loadInventory()}>
                <Text style={styles.refreshButtonText}>Actualizar</Text>
              </Pressable>
            </View>
          </View>

          {loading ? <ActivityIndicator color="#0284c7" /> : null}

          <View style={styles.list}>
            {filteredProducts.map((product) => (
              <Pressable key={product.id} onPress={() => openCaptureModal(product.id)} style={styles.productCard}>
                {product.imagen ? (
                  <Image source={{ uri: product.imagen }} style={styles.productImage} contentFit="cover" />
                ) : (
                  <View style={[styles.productImage, styles.productImagePlaceholder]}>
                    <Text style={styles.productImagePlaceholderText}>{product.nombre.slice(0, 1).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.productBody}>
                  <View style={styles.productTopRow}>
                    <Text numberOfLines={2} style={styles.productName}>
                      {product.nombre}
                    </Text>
                    <View style={[styles.typeBadge, product.tipo_venta === 'peso' ? styles.typeBadgeWeight : styles.typeBadgePiece]}>
                      <Text style={[styles.typeBadgeText, product.tipo_venta === 'peso' ? styles.typeBadgeTextWeight : styles.typeBadgeTextPiece]}>
                        {product.tipo_venta === 'peso' ? 'Granel' : 'Pieza'}
                      </Text>
                    </View>
                  </View>
                  <Text numberOfLines={1} style={styles.productMeta}>
                    {product.codigo_barras}
                  </Text>
                  <View style={styles.productFooterRow}>
                    <Text numberOfLines={1} style={styles.productMeta}>
                      {product.categoria || 'General'}
                    </Text>
                    <Text style={styles.stockText}>Stock {product.stock.toFixed(product.tipo_venta === 'peso' ? 3 : 0)}</Text>
                  </View>
                </View>
              </Pressable>
            ))}

            {!loading && filteredProducts.length === 0 ? <Text style={styles.emptyText}>No hay productos que coincidan con los filtros.</Text> : null}
          </View>
        </View>
      </ScrollView>

      <Modal visible={captureModalOpen} transparent animationType="fade" onRequestClose={() => setCaptureModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalEyebrow}>Captura</Text>
                <Text style={styles.modalTitle}>Registrar entrada</Text>
              </View>
              <Pressable
                onPress={() => {
                  setCaptureModalOpen(false)
                  setQuantity('')
                  setMessage('')
                }}
                style={styles.modalCloseButton}>
                <Text style={styles.modalCloseText}>Cerrar</Text>
              </Pressable>
            </View>

            {selectedProduct ? (
              <>
                <View style={styles.captureCard}>
                  {selectedProduct.imagen ? (
                    <Image source={{ uri: selectedProduct.imagen }} style={styles.captureImage} contentFit="cover" />
                  ) : (
                    <View style={[styles.captureImage, styles.productImagePlaceholder]}>
                      <Text style={styles.productImagePlaceholderText}>{selectedProduct.nombre.slice(0, 1).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={styles.captureBody}>
                    <Text style={styles.captureName}>{selectedProduct.nombre}</Text>
                    <Text style={styles.captureMeta}>{selectedProduct.codigo_barras}</Text>
                    <Text style={styles.captureMeta}>
                      {selectedProduct.categoria || 'General'} · {selectedProduct.tipo_venta === 'peso' ? 'A granel' : 'Por pieza'}
                    </Text>
                    <Text style={styles.captureStock}>
                      Stock actual {selectedProduct.stock.toFixed(selectedProduct.tipo_venta === 'peso' ? 3 : 0)}
                    </Text>
                  </View>
                </View>

                <TextInput
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="numeric"
                  placeholder={selectedProduct.tipo_venta === 'peso' ? 'Cantidad en kg' : 'Cantidad de piezas'}
                  style={styles.modalInput}
                />

                {message ? <Text style={styles.message}>{message}</Text> : null}

                <Pressable
                  disabled={saving || !quantity.trim()}
                  style={[styles.primaryButton, saving && styles.buttonDisabled]}
                  onPress={async () => {
                    setSaving(true)
                    setMessage('')
                    try {
                      await api.post(
                        '/inventario/stock/entrada',
                        { productoId: selectedProduct.id, cantidad: Number(quantity) },
                        { headers: { Authorization: `Bearer ${session.token}` } },
                      )
                      await loadInventory()
                      setQuantity('')
                      setMessage('Entrada registrada correctamente.')
                      setCaptureModalOpen(false)
                    } catch {
                      setMessage('No se pudo registrar la entrada.')
                    } finally {
                      setSaving(false)
                    }
                  }}>
                  {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Registrar entrada</Text>}
                </Pressable>
              </>
            ) : (
              <Text style={styles.emptyText}>Selecciona un producto desde la lista.</Text>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={newProductModalOpen} transparent animationType="fade" onRequestClose={() => setNewProductModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalEyebrow}>Nuevo</Text>
                <Text style={styles.modalTitle}>Registrar producto</Text>
              </View>
              <Pressable
                onPress={() => {
                  setNewProductModalOpen(false)
                  setNewProductForm({
                    nombre: '',
                    codigo_barras: '',
                    categoria: '',
                    precio: '',
                    cantidadInicial: '',
                    tipo_venta: 'pieza',
                  })
                  setMessage('')
                }}
                style={styles.modalCloseButton}>
                <Text style={styles.modalCloseText}>Cerrar</Text>
              </Pressable>
            </View>

            <View style={styles.creationModeRow}>
              {([
                { key: 'barcode', label: 'Codigo de barras' },
                { key: 'manual', label: 'Nuevo sin codigo' },
              ] as const).map((mode) => (
                <Pressable
                  key={mode.key}
                  style={[styles.creationModeChip, newProductMode === mode.key && styles.creationModeChipActive]}
                  onPress={() => {
                    setNewProductMode(mode.key)
                    setNewProductForm({
                      nombre: '',
                      codigo_barras: '',
                      categoria: '',
                      precio: '',
                      cantidadInicial: '',
                      tipo_venta: 'pieza',
                    })
                    setMessage('')
                  }}>
                  <Text style={[styles.creationModeChipText, newProductMode === mode.key && styles.creationModeChipTextActive]}>{mode.label}</Text>
                </Pressable>
              ))}
            </View>

            {newProductMode === 'barcode' ? (
              <>
                <TextInput
                  value={newProductForm.codigo_barras}
                  onChangeText={(value) => setNewProductForm((current) => ({ ...current, codigo_barras: value, tipo_venta: 'pieza' }))}
                  onEndEditing={() => {
                    if (newProductForm.codigo_barras.trim()) {
                      void lookupBarcodeForNewProduct(newProductForm.codigo_barras)
                    }
                  }}
                  placeholder="Codigo de barras"
                  style={styles.modalInput}
                />
                <View style={styles.newProductActionRow}>
                  <Pressable style={styles.scanInlineButton} onPress={() => void openBarcodeScanner()}>
                    <Text style={styles.scanInlineButtonText}>Tomar foto del codigo</Text>
                  </Pressable>
                </View>
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
                      style={[styles.saleTypeChip, newProductForm.tipo_venta === type.key && styles.saleTypeChipActive]}
                      onPress={() => setNewProductForm((current) => ({ ...current, tipo_venta: type.key }))}>
                      <Text style={[styles.saleTypeChipText, newProductForm.tipo_venta === type.key && styles.saleTypeChipTextActive]}>{type.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
            <TextInput
              value={newProductForm.nombre}
              onChangeText={(value) => setNewProductForm((current) => ({ ...current, nombre: value }))}
              placeholder="Nombre del producto"
              style={styles.modalInput}
            />
            <TextInput
              value={newProductForm.categoria}
              onChangeText={(value) => setNewProductForm((current) => ({ ...current, categoria: value }))}
              placeholder="Categoria"
              style={styles.modalInput}
            />
            <TextInput
              value={newProductForm.precio}
              onChangeText={(value) => setNewProductForm((current) => ({ ...current, precio: value }))}
              keyboardType="numeric"
              placeholder={newProductForm.tipo_venta === 'peso' ? 'Precio por kilo' : 'Precio'}
              style={styles.modalInput}
            />
            <TextInput
              value={newProductForm.cantidadInicial}
              onChangeText={(value) => setNewProductForm((current) => ({ ...current, cantidadInicial: value }))}
              keyboardType="numeric"
              placeholder="Cantidad inicial"
              style={styles.modalInput}
            />

            {message ? <Text style={styles.message}>{message}</Text> : null}

            <Pressable
              disabled={
                newProductSaving ||
                lookupLoading ||
                !newProductForm.nombre.trim() ||
                !newProductForm.precio.trim() ||
                !newProductForm.cantidadInicial.trim() ||
                (newProductMode === 'barcode' && !newProductForm.codigo_barras.trim())
              }
              style={[styles.primaryButton, (newProductSaving || lookupLoading) && styles.buttonDisabled]}
              onPress={async () => {
                setNewProductSaving(true)
                setMessage('')
                try {
                  const barcodeToSave = newProductMode === 'manual' ? buildNextInternalBarcode() : newProductForm.codigo_barras.trim()
                  const createResponse = await api.post<Product>(
                    '/productos',
                    {
                      nombre: newProductForm.nombre.trim(),
                      codigo_barras: barcodeToSave,
                      categoria: newProductForm.categoria.trim(),
                      precio: Number(newProductForm.precio),
                      tipo_venta: newProductMode === 'manual' ? newProductForm.tipo_venta : 'pieza',
                      stock: 0,
                    },
                    { headers: { Authorization: `Bearer ${session.token}` } },
                  )

                  await api.post(
                    '/inventario/stock/entrada',
                    { productoId: createResponse.data.id, cantidad: Number(newProductForm.cantidadInicial) },
                    { headers: { Authorization: `Bearer ${session.token}` } },
                  )

                  await loadInventory()
                  setNewProductModalOpen(false)
                  setNewProductForm({
                    nombre: '',
                    codigo_barras: '',
                    categoria: '',
                    precio: '',
                    cantidadInicial: '',
                    tipo_venta: 'pieza',
                  })
                  setNewProductMode('barcode')
                  setMessage('')
                } catch {
                  setMessage('No se pudo crear el producto o registrar la entrada.')
                } finally {
                  setNewProductSaving(false)
                }
              }}>
              {newProductSaving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Guardar producto</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={barcodeScannerOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setBarcodeScannerOpen(false)}>
        <SafeAreaView style={styles.scannerSafeArea}>
          <View style={styles.scannerHeader}>
            <View style={styles.scannerHeaderTextBlock}>
              <Text style={styles.scannerEyebrow}>Escaner</Text>
              <Text style={styles.scannerTitle}>Leer codigo de barras</Text>
            </View>
            <View style={styles.scannerHeaderActions}>
              <Pressable style={styles.flashButton} onPress={() => setBarcodeScannerTorch((current) => !current)}>
                <Text style={styles.flashButtonText}>{barcodeScannerTorch ? 'Flash encendido' : 'Flash apagado'}</Text>
              </Pressable>
              <Pressable
                style={styles.modalCloseButton}
                onPress={() => {
                  setBarcodeScannerOpen(false)
                  setBarcodeScannerLocked(false)
                  setBarcodeScannerTorch(false)
                }}>
                <Text style={styles.modalCloseText}>Cerrar</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.scannerFrame}>
            <CameraView
              style={StyleSheet.absoluteFill}
              enableTorch={barcodeScannerTorch}
              barcodeScannerSettings={{
                barcodeTypes: ['ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e'],
              }}
              onBarcodeScanned={
                barcodeScannerLocked
                  ? undefined
                  : ({ data }) => {
                      if (!data) return
                      setBarcodeScannerLocked(true)
                      setNewProductForm((current) => ({ ...current, codigo_barras: data }))
                      setBarcodeScannerOpen(false)
                      setBarcodeScannerTorch(false)
                      void lookupBarcodeForNewProduct(data)
                    }
              }
            />
            <View style={styles.scannerOverlay}>
              <View style={styles.scannerGuide} />
            </View>
          </View>

          <Text style={styles.scannerHint}>Coloca el codigo dentro del recuadro. Al detectarlo se dispara la busqueda automaticamente.</Text>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f3f7fb' },
  container: { padding: 20, gap: 16 },
  heroCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    borderRadius: 28,
    backgroundColor: '#ffffff',
    padding: 20,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  heroContent: { flex: 1 },
  eyebrow: { color: '#0284c7', fontSize: 12, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  title: { marginTop: 8, fontSize: 28, fontWeight: '800', color: '#0f172a' },
  subtitle: { marginTop: 8, fontSize: 14, lineHeight: 20, color: '#64748b' },
  heroBadge: { alignItems: 'center', justifyContent: 'center', minWidth: 92, borderRadius: 24, backgroundColor: '#dcfce7', paddingHorizontal: 14, paddingVertical: 12 },
  heroBadgeValue: { fontSize: 28, fontWeight: '800', color: '#15803d' },
  heroBadgeLabel: { marginTop: 2, fontSize: 12, fontWeight: '700', color: '#15803d', textTransform: 'uppercase', letterSpacing: 1 },
  filterPanel: {
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
  searchInput: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dbe4ee',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#0f172a',
  },
  chipsGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 16,
    backgroundColor: '#eef2f7',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipActive: {
    backgroundColor: '#dbeafe',
  },
  chipText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  chipTextActive: { color: '#1d4ed8' },
  categoryRow: { gap: 8, paddingRight: 8 },
  categoryPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  categoryPillActive: {
    borderColor: '#bae6fd',
    backgroundColor: '#f0f9ff',
  },
  categoryPillText: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  categoryPillTextActive: { color: '#0369a1' },
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
  sectionHeaderRow: { flexDirection: 'column', alignItems: 'stretch', gap: 12 },
  sectionHeaderTextBlock: { alignItems: 'center', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  sectionTitle: { fontSize: 19, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  sectionHint: { fontSize: 13, color: '#64748b', textAlign: 'center' },
  creationModeRow: { flexDirection: 'row', gap: 8 },
  creationModeChip: { flex: 1, borderRadius: 16, backgroundColor: '#e2e8f0', paddingVertical: 12, alignItems: 'center' },
  creationModeChipActive: { backgroundColor: '#dbeafe' },
  creationModeChipText: { color: '#475569', fontSize: 13, fontWeight: '700' },
  creationModeChipTextActive: { color: '#1d4ed8' },
  refreshButton: { flex: 1, borderRadius: 16, backgroundColor: '#eef6ff', paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  refreshButtonText: { color: '#0369a1', fontWeight: '700', fontSize: 13, textAlign: 'center' },
  secondaryActionButton: { flex: 1, borderRadius: 16, backgroundColor: '#dcfce7', paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  secondaryActionText: { color: '#15803d', fontWeight: '700', fontSize: 13, textAlign: 'center' },
  list: { gap: 10 },
  productCard: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 22,
    backgroundColor: '#f8fafc',
    padding: 12,
    alignItems: 'center',
  },
  productImage: { width: 56, height: 56, borderRadius: 16, backgroundColor: '#e2e8f0' },
  productImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  productImagePlaceholderText: { fontSize: 20, fontWeight: '800', color: '#64748b' },
  productBody: { flex: 1, minWidth: 0, gap: 4, justifyContent: 'center' },
  productTopRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  productName: { flex: 1, fontSize: 15, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  typeBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  typeBadgePiece: { backgroundColor: '#dbeafe' },
  typeBadgeWeight: { backgroundColor: '#dcfce7' },
  typeBadgeText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  typeBadgeTextPiece: { color: '#1d4ed8' },
  typeBadgeTextWeight: { color: '#15803d' },
  productMeta: { fontSize: 12, color: '#64748b', textAlign: 'center' },
  productFooterRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  stockText: { fontSize: 12, fontWeight: '700', color: '#0f172a' },
  emptyText: { fontSize: 14, color: '#64748b', textAlign: 'center', paddingVertical: 10 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 460,
    borderRadius: 28,
    backgroundColor: '#ffffff',
    padding: 20,
    gap: 14,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  modalEyebrow: { color: '#0284c7', fontSize: 12, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  modalTitle: { marginTop: 6, fontSize: 24, fontWeight: '800', color: '#0f172a' },
  modalCloseButton: { borderRadius: 14, backgroundColor: '#f1f5f9', paddingHorizontal: 12, paddingVertical: 10 },
  modalCloseText: { color: '#475569', fontSize: 13, fontWeight: '700' },
  captureCard: { flexDirection: 'row', gap: 14, alignItems: 'center', borderRadius: 22, backgroundColor: '#f8fafc', padding: 14 },
  captureImage: { width: 78, height: 78, borderRadius: 22, backgroundColor: '#e2e8f0' },
  captureBody: { flex: 1, minWidth: 0, gap: 4, alignItems: 'center' },
  captureName: { fontSize: 17, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  captureMeta: { fontSize: 13, color: '#64748b', textAlign: 'center' },
  captureStock: { marginTop: 2, fontSize: 13, fontWeight: '700', color: '#0f172a', textAlign: 'center' },
  modalInput: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dbe4ee',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#0f172a',
  },
  newProductActionRow: { flexDirection: 'row', gap: 8 },
  scanInlineButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#e0f2fe',
    paddingVertical: 12,
  },
  scanInlineButtonText: { color: '#075985', fontSize: 14, fontWeight: '700' },
  manualInfoCard: { borderRadius: 18, backgroundColor: '#f8fafc', paddingHorizontal: 14, paddingVertical: 12 },
  manualInfoText: { fontSize: 13, color: '#475569', textAlign: 'center' },
  saleTypeRow: { flexDirection: 'row', gap: 8 },
  saleTypeChip: { flex: 1, borderRadius: 16, backgroundColor: '#e2e8f0', paddingVertical: 12, alignItems: 'center' },
  saleTypeChipActive: { backgroundColor: '#dcfce7' },
  saleTypeChipText: { color: '#475569', fontSize: 13, fontWeight: '700' },
  saleTypeChipTextActive: { color: '#15803d' },
  lookupButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    paddingVertical: 12,
  },
  lookupButtonText: { color: '#475569', fontSize: 14, fontWeight: '700' },
  message: { fontSize: 14, color: '#15803d' },
  primaryButton: { alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#16a34a', paddingVertical: 15 },
  buttonDisabled: { opacity: 0.7 },
  primaryButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  scannerSafeArea: { flex: 1, backgroundColor: '#0f172a' },
  scannerHeader: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 18, gap: 12 },
  scannerHeaderTextBlock: { width: '100%' },
  scannerHeaderActions: { flexDirection: 'row', gap: 8, width: '100%' },
  scannerEyebrow: { color: '#7dd3fc', fontSize: 12, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  scannerTitle: { marginTop: 6, fontSize: 28, fontWeight: '800', color: '#ffffff', flexShrink: 1 },
  flashButton: { flex: 1, borderRadius: 16, backgroundColor: '#fde68a', paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  flashButtonText: { color: '#92400e', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  scannerFrame: {
    marginHorizontal: 20,
    flex: 1,
    overflow: 'hidden',
    borderRadius: 28,
    backgroundColor: '#020617',
  },
  scannerOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.12)',
  },
  scannerGuide: {
    width: '82%',
    height: 150,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: '#7dd3fc',
    backgroundColor: 'transparent',
  },
  scannerHint: { padding: 20, textAlign: 'center', color: '#cbd5e1', fontSize: 14, lineHeight: 20 },
})
