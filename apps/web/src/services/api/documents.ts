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

  // ファイルをアップロード（直接Storageへ）
  async upload(file: File): Promise<Document> {
    const client = getApiClient()

    // Step 1: Get signed upload URL
    const urlResponse = await client.post<ApiResponse<{
      uploadUrl: string
      path: string
      token: string
    }>>('/storage/upload-url', {
      fileName: file.name,
      fileType: file.type,
    })

    const { uploadUrl, path, token } = urlResponse.data

    // Step 2: Upload directly to Supabase Storage
    const uploadFormData = new FormData()
    uploadFormData.append('file', file)
    uploadFormData.append('token', token)

    const uploadResult = await fetch(uploadUrl, {
      method: 'POST',
      body: uploadFormData,
    })

    if (!uploadResult.ok) {
      throw new Error(`Upload failed: ${uploadResult.statusText}`)
    }

    // Step 3: Notify backend to process the uploaded file
    const completeResponse = await client.post<ApiResponse<Document>>('/storage/complete', {
      path,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
    })

    return completeResponse.data
  },
}
