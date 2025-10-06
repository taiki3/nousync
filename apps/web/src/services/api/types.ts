export class ApiError extends Error {
  status: number
  statusText: string
  body?: string
  response?: Response

  constructor(status: number, statusText: string, body?: string, response?: Response) {
    super(`API Error ${status}: ${statusText}`)
    this.name = 'ApiError'
    this.status = status
    this.statusText = statusText
    this.body = body
    this.response = response
  }

  get isAuthError() {
    return this.status === 401
  }

  get isNotFound() {
    return this.status === 404
  }

  get isServerError() {
    return this.status >= 500
  }

  get isBadRequest() {
    return this.status === 400
  }

  get isConflict() {
    return this.status === 409
  }
}

export interface ApiResponse<T> {
  data: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export interface ApiRequestConfig extends RequestInit {
  timeout?: number
  skipAuth?: boolean
  retries?: number
  retryDelay?: number
}

// Common API response types
export interface SuccessResponse {
  success: boolean
  message?: string
}

export interface ErrorResponse {
  error: string
  details?: Record<string, unknown>
  code?: string
}

// Re-export for better module resolution
export type { ApiRequestConfig as ApiRequestConfigType }
