# POS Movil

Aplicacion movil del sistema POS para tienda de abarrotes.

## Stack

- Expo
- React Native
- Expo Router
- Axios

## Funciones principales

- Login con roles `admin` y `vendedor`
- Dashboard por rol
- Inventario movil
- Registro de entradas de stock
- Alta de productos
- Escaneo de codigo de barras con camara
- Generacion y comparticion de PDF para codigos internos
- Perfil y cierre de sesion

## Variables de entorno

Crea un archivo `.env` con:

```env
EXPO_PUBLIC_API_BASE_URL="http://TU_HOST_O_DOMINIO:4000/api"
```

## Instalacion

```bash
npm install
```

## Desarrollo

```bash
npx expo start -c
```

## Otros comandos

```bash
npm run android
npm run ios
npm run web
```

## Credenciales demo

- Admin
  - correo: `admin@tienda.local`
  - contrasena: `admin123`

- Empleado
  - correo: `empleado@tienda.local`
  - contrasena: `empleado123`

## Nota

La app movil necesita que el backend este disponible en la URL definida en `EXPO_PUBLIC_API_BASE_URL`.

Si usas Expo Go en red local, el telefono y la PC deben estar en la misma red.
