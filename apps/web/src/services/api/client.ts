import { API_URL } from '../../config/api'
import { ApiError, type ApiRequestConfig } from './types'

type CheckAndRefreshToken = () => Promise<boolean>
type GetToken = () => string | undefined
type HandleAuthError = (error: { status: number }) => void

interface ApiClientConfig {
  checkAndRefreshToken: CheckAndRefreshToken
  getToken: GetToken
  handleAuthError: HandleAuthError
}

class ApiClient {
  private checkAndRefreshToken: CheckAndRefreshToken
  private getToken: GetToken
  private handleAuthError: HandleAuthError

  constructor(config: ApiClientConfig) {
    this.checkAndRefreshToken = config.checkAndRefreshToken
    this.getToken = config.getToken
    this.handleAuthError = config.handleAuthError
  }

  // ストリーミング処理のためにトークンとAPIベースURLを公開
  getAuthToken(): string | undefined {
    return this.getToken()
  }

  getApiBaseUrl(): string {
    return API_URL
  }

  private async request<T>(endpoint: string, config: ApiRequestConfig = {}): Promise<T> {
    const { timeout = 30000, skipAuth = false, ...fetchConfig } = config

    // トークンの確認とリフレッシュ
    if (!skipAuth) {
      const tokenValid = await this.checkAndRefreshToken()
      if (!tokenValid) {
        throw new ApiError(401, 'Unauthorized', 'Token is invalid or expired', undefined)
      }
    }

    const token = await this.getToken()
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        ...fetchConfig,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(token && !skipAuth ? { Authorization: `Bearer ${token}` } : {}),
          ...fetchConfig.headers,
        },
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorBody = await response.text()
        const error = new ApiError(response.status, response.statusText, errorBody, response)

        if (error.isAuthError) {
          this.handleAuthError({ status: 401 })
        }

        throw error
      }

      // 204 No Content の場合
      if (response.status === 204) {
        return {} as T
      }

      const data = await response.json()
      return data
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof ApiError) {
        throw error
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ApiError(408, 'Request Timeout', 'The request took too long to complete')
      }

      throw new ApiError(
        0,
        'Network Error',
        error instanceof Error ? error.message : 'Unknown error',
      )
    }
  }

  async get<T>(endpoint: string, config?: ApiRequestConfig): Promise<T> {
    return this.request<T>(endpoint, { ...config, method: 'GET' })
  }

  async post<T>(endpoint: string, data?: unknown, config?: ApiRequestConfig): Promise<T> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async put<T>(endpoint: string, data?: unknown, config?: ApiRequestConfig): Promise<T> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async patch<T>(endpoint: string, data?: unknown, config?: ApiRequestConfig): Promise<T> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async delete<T>(endpoint: string, config?: ApiRequestConfig): Promise<T> {
    return this.request<T>(endpoint, { ...config, method: 'DELETE' })
  }

  // マルチパートフォームデータ用
  async upload<T>(endpoint: string, formData: FormData, config?: ApiRequestConfig): Promise<T> {
    const { headers = {}, ...restConfig } = config || {}

    // Content-Type を削除して、ブラウザが自動的に設定するようにする
    const { 'Content-Type': _, ...restHeaders } = headers as Record<string, string>

    return this.request<T>(endpoint, {
      ...restConfig,
      method: 'POST',
      headers: restHeaders,
      body: formData,
    })
  }
}

// シングルトンインスタンスを作成するファクトリー関数
let apiClientInstance: ApiClient | null = null

export function createApiClient(config: ApiClientConfig): ApiClient {
  if (!apiClientInstance) {
    apiClientInstance = new ApiClient(config)
  }
  return apiClientInstance
}

export function getApiClient(): ApiClient {
  if (!apiClientInstance) {
    throw new Error('ApiClient has not been initialized. Call createApiClient first.')
  }
  return apiClientInstance
}

export function isApiClientInitialized(): boolean {
  return apiClientInstance !== null
}
