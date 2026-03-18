import Constants from 'expo-constants'
import axios from 'axios'

function getBaseUrl() {
  const explicitUrl = process.env.EXPO_PUBLIC_API_BASE_URL
  if (explicitUrl) {
    return explicitUrl.replace(/\/$/, '')
  }

  const hostUri = Constants.expoGoConfig?.hostUri || Constants.manifest2?.extra?.expoGo?.debuggerHost || ''
  const host = hostUri.split(':')[0]

  if (host) {
    return `http://${host}:4000/api`
  }

  return 'http://localhost:4000/api'
}

export const API_BASE_URL = getBaseUrl()

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})
