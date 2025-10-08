import type {
  AIModel,
  ApiResponse,
  ChatResponse as BackendChatResponse,
  Document,
} from '@nousync/shared'
import { getApiClient } from './client'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  model?: string
  contextDocuments?: Document[]
  isThinking?: boolean
  timestamp?: number
}

export interface ChatMessageRequest {
  conversationId: number
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
  contextDocuments?: Document[]
  stream?: boolean
  model?: string
}

export interface ChatResponse {
  content: string
  model: string
}

export interface ResearchRequest {
  conversationId: number
  topic: string
  existingDocuments?: string[]
  depth?: 'shallow' | 'medium' | 'deep'
  modelId?: string
}

export interface ResearchResult {
  documents: Array<{
    id: string
    title: string
    content: string
    summary?: string
    tags?: string[]
    url?: string
  }>
  summary: string
}

export interface CreateConversationResponse {
  data: {
    conversationId: number
  }
}

export const chatApi = {
  // 新しい会話を作成
  async createConversation(title = 'New Conversation'): Promise<number> {
    const client = getApiClient()
    const response = await client.post<CreateConversationResponse>('/chat/conversations', {
      title,
    })
    return response.data.conversationId
  },

  // チャットメッセージを送信（ストリーミング対応）
  async sendMessage(
    request: ChatMessageRequest,
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<ChatResponse> {
    const client = getApiClient()
    const { conversationId, messages, contextDocuments, model } = request

    // Get the last user message as the content
    const lastUserMessage = messages.filter((m) => m.role === 'user').pop()
    if (!lastUserMessage) {
      throw new Error('No user message found')
    }

    // Convert to backend format
    const messageData = {
      message: lastUserMessage.content,  // APIは 'message' フィールドを期待
      model: model,  // 'modelId' ではなく 'model'
      documentIds: contextDocuments?.map(doc => doc.id) || []  // 全文コンテキスト用
    }

    if (request.stream && onChunk) {
      // ストリーミングレスポンスの処理
      // Note: ストリーミングには直接fetchを使用する必要がある
      const token = client.getAuthToken()
      const apiUrl = client.getApiBaseUrl()
      const response = await fetch(`${apiUrl}/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(messageData),
        signal,
      })

      if (!response.ok) {
        await response.text() // Consume response body to avoid memory leak
        throw new Error(`Chat API error: ${response.status} ${response.statusText}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''

      if (reader) {
        let buffer = ''
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim()
                if (!data || data === '[DONE]') continue

                try {
                  const parsed = JSON.parse(data)
                  if (parsed.type === 'chunk' && parsed.content) {
                    fullContent += parsed.content
                    onChunk(parsed.content)
                  } else if (parsed.type === 'done') {
                    fullContent = parsed.fullResponse || fullContent
                  } else if (parsed.type === 'error') {
                    throw new Error(parsed.error || 'Stream error')
                  }
                } catch (e) {
                  console.error('Failed to parse SSE data:', e)
                }
              }
            }
          }
        } finally {
          reader.releaseLock()
        }
      }

      return {
        content: fullContent,
        model: model || 'claude-3.5-sonnet',
      }
    }
    // 通常のレスポンス
    const response = await client.post<ApiResponse<BackendChatResponse>>(
      `/chat/conversations/${conversationId}/messages`,
      messageData,
      {
        signal,
        timeout: 180000, // 3分のタイムアウト
      },
    )

    // Extract the actual response from the ApiResponse wrapper
    if (
      response.status === 'success' &&
      response.data &&
      'response' in response.data &&
      response.data.response
    ) {
      return {
        content: response.data.response,
        model: model || 'claude-3.5-sonnet',
      }
    }

    throw new Error('No response data received')
  },

  // リサーチを実行
  async research(request: ResearchRequest, signal?: AbortSignal): Promise<ResearchResult> {
    const client = getApiClient()
    const { conversationId, ...researchData } = request
    const response = await client.post<
      ApiResponse<{ documentId: string; title: string; summary: string | null }>
    >(`/chat/conversations/${conversationId}/research`, researchData, {
      signal,
      timeout: 300000, // 5分のタイムアウト
    })

    // Convert backend response to ResearchResult format
    if (response.data) {
      return {
        documents: [
          {
            id: response.data.documentId,
            title: response.data.title,
            content: '', // Content is not returned by the API
            summary: response.data.summary || undefined,
            tags: ['research', 'ai-generated'],
          },
        ],
        summary:
          response.data.summary ||
          `Research document "${response.data.title}" has been created successfully.`,
      }
    }

    throw new Error('No research data received')
  },

  // 会話履歴を取得
  async getHistory(limit?: number): Promise<Message[]> {
    const client = getApiClient()
    const params = limit ? `?limit=${limit}` : ''
    const response = await client.get<Message[]>(`/chat/history${params}`)
    return response
  },

  // 会話履歴をクリア
  async clearHistory(): Promise<void> {
    const client = getApiClient()
    await client.delete('/chat/history')
  },

  // 利用可能なモデルを取得
  async getModels(): Promise<AIModel[]> {
    const client = getApiClient()
    const response = await client.get<ApiResponse<{ models: AIModel[] }>>('/chat/models')

    // Handle ApiResponse wrapper
    if (response.data?.models) {
      return response.data.models
    }
    return []
  },
}

// ストリーミング用のヘルパー関数
export async function createChatStream(request: ChatMessageRequest): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder()
  const client = getApiClient()
  const token = client.getAuthToken()
  const apiUrl = client.getApiBaseUrl()

  return new ReadableStream({
    async start(controller) {
      try {
        const response = await fetch(`${apiUrl}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ ...request, stream: true }),
        })

        if (!response.ok) {
          throw new Error(`Chat API error: ${response.statusText}`)
        }

        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error('No response body')
        }

        const decoder = new TextDecoder()

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          controller.enqueue(encoder.encode(chunk))
        }

        controller.close()
      } catch (error) {
        controller.error(error)
      }
    },
  })
}
