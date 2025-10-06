import type { Document } from '@nousync/shared'
import { getApiClient } from './client'
import type { ApiResponse } from './types'

export interface CreateDocumentParams {
  title: string
  content: string
  summary: string
  tags: string[]
}

export interface UpdateDocumentParams {
  content?: string
  tags?: string[]
}

export const documentsApi = {
  // ドキュメント一覧を取得
  async getAll(): Promise<Document[]> {
    const client = getApiClient()
    const response = await client.get<Document[] | ApiResponse<Document[]>>('/documents')

    // APIレスポンスの形式に対応
    if (Array.isArray(response)) {
      return response
    }
    return response.data || []
  },

  // 特定のドキュメントを取得
  async getById(id: string): Promise<Document> {
    const client = getApiClient()
    const response = await client.get<Document | ApiResponse<Document>>(`/documents?id=${id}`)

    // APIレスポンスの形式に対応
    if ('data' in response) {
      return response.data
    }
    return response
  },

  // ドキュメントを作成
  async create(params: CreateDocumentParams): Promise<Document> {
    const client = getApiClient()
    const response = await client.post<Document | ApiResponse<Document>>('/documents', params)

    // APIレスポンスの形式に対応
    if ('data' in response) {
      return response.data
    }
    return response
  },

  // ドキュメントを更新
  async update(id: string, params: UpdateDocumentParams): Promise<Document> {
    const client = getApiClient()
    const response = await client.put<Document | ApiResponse<Document>>(
      `/documents?id=${id}`,
      params,
    )

    // APIレスポンスの形式に対応
    if ('data' in response) {
      return response.data
    }
    return response
  },

  // ドキュメントを削除
  async delete(id: string): Promise<void> {
    const client = getApiClient()
    await client.delete(`/documents?id=${id}`)
  },

  // ドキュメントを検索
  async search(query: string, k?: number): Promise<Document[]> {
    const client = getApiClient()
    const params = new URLSearchParams({ query })
    if (k !== undefined) {
      params.append('k', k.toString())
    }

    const response = await client.get<Document[] | ApiResponse<Document[]>>(
      `/search?${params.toString()}`,
    )

    // APIレスポンスの形式に対応
    if (Array.isArray(response)) {
      return response
    }
    return response.data || []
  },

  // ファイルをアップロード
  async upload(file: File): Promise<Document> {
    const client = getApiClient()
    const formData = new FormData()
    formData.append('file', file)

    const response = await client.upload<Document | ApiResponse<Document>>(
      '/documents',
      formData,
    )

    // APIレスポンスの形式に対応
    if ('data' in response) {
      return response.data
    }
    return response
  },
}
