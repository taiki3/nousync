import { useCallback, useState } from 'react'
// TODO: AuthContext を後で実装する必要があります
// import { useAuth } from '../contexts/AuthContext'
import { ApiError } from '../services/api'

interface UseApiCallOptions<T = unknown> {
  onSuccess?: (data: T) => void
  onError?: (error: ApiError | Error) => void
  showErrorAlert?: boolean
}

export function useApiCall<T = unknown>(options: UseApiCallOptions<T> = {}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // TODO: AuthContext実装後にコメント解除
  // const { handleAuthError } = useAuth()

  const execute = useCallback(
    async (apiCall: () => Promise<T>): Promise<T | null> => {
      setLoading(true)
      setError(null)

      try {
        // Check if API client is initialized before making the call
        try {
          const result = await apiCall()
          options.onSuccess?.(result)
          return result
        } catch (clientError) {
          // If it's an initialization error, don't treat it as a normal API error
          if (
            clientError instanceof Error &&
            clientError.message?.includes('ApiClient has not been initialized')
          ) {
            setLoading(false)
            return null
          }
          throw clientError
        }
      } catch (error) {
        let errorMessage = 'An error occurred'

        if (error instanceof ApiError) {
          if (error.isAuthError) {
            // TODO: AuthContext実装後にコメント解除
            // handleAuthError({ status: 401 })
            console.error('Auth error occurred:', error)
          }
          errorMessage = error.message
        } else if (error instanceof Error) {
          errorMessage = error.message
        }

        setError(errorMessage)
        options.onError?.(error as ApiError | Error)

        if (options.showErrorAlert) {
          // console.error('API Error (would show alert):', errorMessage)
          // alert(errorMessage)
        }
        return null
      } finally {
        setLoading(false)
      }
    },
    [options], // TODO: AuthContext実装後はhandleAuthErrorも追加
  )

  return { execute, loading, error, setError }
}
