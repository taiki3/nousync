// API configuration
const getApiUrl = () => {
  // If VITE_API_URL is set, use it (highest priority)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }

  // If VITE_API_HOST is set, construct URL from host and port
  if (import.meta.env.VITE_API_HOST) {
    const host = import.meta.env.VITE_API_HOST
    const port = import.meta.env.VITE_API_PORT || '3001'
    const apiUrl = `http://${host}:${port}`
    return apiUrl
  }

  // In production, use the same origin with /api prefix (Vercel will route to serverless functions)
  if (import.meta.env.PROD) {
    const apiUrl = '/api' // /api prefix for Vercel serverless functions
    return apiUrl
  }

  // In development or when accessing via IP but not in production mode
  if (window.location.hostname !== 'localhost') {
    const apiUrl = `${window.location.protocol}//${window.location.hostname}:3001`
    return apiUrl
  }

  // In development with localhost, check if using Docker dev environment
  const apiUrl = window.location.port === '81' ? 'http://localhost:3002' : 'http://localhost:3001'
  return apiUrl
}

export const API_URL = getApiUrl()
