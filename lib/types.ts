export type Role = 'admin' | 'vendedor'

export type User = {
  id: number
  nombre: string
  email: string
  rol: Role
}

export type Sale = {
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

export type CashCut = {
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

export type AuthSession = {
  token: string
  user: User
}

export type Product = {
  id: number
  nombre: string
  codigo_barras: string
  marca?: string
  cantidad?: string
  categoria?: string
  imagen?: string
  precio: number
  tipo_venta: 'pieza' | 'peso'
  stock: number
  createdAt: string
}

export type ProductLookupResult = {
  id?: number
  nombre: string
  codigo_barras: string
  tipo_venta: 'pieza' | 'peso'
  precio: number
  stock: number
  existsInCatalog: boolean
  source: string
  marca?: string
  cantidad?: string
  categoria?: string
  descripcion?: string
  imagen?: string
}

export type BarcodePdfResponse = {
  filename: string
  contentBase64: string
}

export type StockMovement = {
  id: number
  productoId: number
  tipo: 'entrada' | 'salida'
  cantidad: number
  fecha: string
}

export type InventoryResponse = {
  items: Product[]
  movements: StockMovement[]
}
