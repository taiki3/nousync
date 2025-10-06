export type ApiStatus = 'success' | 'error'

export interface ApiResponse<T> {
  status: ApiStatus
  data?: T
  error?: string
}

export interface DocumentItem {
  id: string
  userId: string
  projectId?: string | null
  title: string
  content: string
  summary?: string | null
  tags?: string[]
  fileName?: string | null
  fileSize?: number | null
  mimeType?: string | null
  createdAt: string
  updatedAt: string
}

export interface SearchResultItem {
  id: string
  title: string
  snippet: string
  createdAt: string
}
