// Shared types for Nousync application

export interface Document {
  id: string
  title: string
  content: string
  tags: string[]
  summary?: string | null
  fileData?: string | null
  fileName?: string | null
  fileSize?: number | null
  mimeType?: string | null
  projectId?: number | null
  userId: string
  createdAt: Date
  updatedAt: Date
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export interface Project {
  id: string
  name: string
  description?: string | null
  color?: string | null
  isDefault: boolean
  userId: string
  createdAt: Date
  updatedAt: Date
}

export interface User {
  id: string
  email: string
  name?: string
}

// API Response types
export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
  status?: string | number
}

// Document types
export interface CreateDocumentInput {
  title?: string
  content: string
  tags?: string[]
  projectId?: number
  summary?: string
  fileData?: string | ArrayBuffer | Uint8Array
  fileName?: string
  fileSize?: number
  mimeType?: string
}

export interface UpdateDocumentInput {
  title?: string
  content?: string
  tags?: string[]
  projectId?: number | null
  summary?: string
}

// Project types
export interface CreateProjectInput {
  name: string
  description?: string
}

export interface UpdateProjectInput {
  name?: string
  description?: string
}

// Chat types
export type AIModelName = 'claude-3-sonnet' | 'claude-3-opus' | 'claude-3-haiku' | 'claude-3-5-sonnet' | 'claude-3-5-haiku' | 'gpt-4' | 'gpt-4o' | 'gpt-4o-mini' | 'gpt-3.5-turbo'

export interface AIModel {
  provider: string
  modelId: string
  displayName: string
}

export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ChatRequest {
  message?: string
  content?: string
  documentIds?: string[]
  conversationId?: string | number
  aiModel?: AIModelName
  modelId?: string
  useRAG?: boolean
  projectId?: number
}

export interface ChatResponse {
  message?: string
  response?: string
  conversationId?: string | number
  contextDocumentIds?: number[]
  sources?: Array<{
    documentId: string | number
    title: string
    excerpt: string
  }>
}

export interface ResearchRequest {
  query?: string
  topic?: string
  documentIds?: string[]
  depth?: string | number
  modelId?: string
}

export interface ResearchResult {
  answer: string
  title?: string
  content?: string
  summary?: string
  sources: Array<{
    documentId: string | number
    title: string
    excerpt: string
    relevance: number
  }>
}

// Search types
export interface SearchQuery {
  query: string
  filters?: {
    tags?: string[]
    projectId?: number
    dateRange?: {
      start?: Date
      end?: Date
    }
  }
  limit?: number
  offset?: number
}

export interface SearchResult {
  documents: Document[]
  totalCount: number
  highlights?: Record<string, string[]>
}

// Embedding types
export interface EmbeddingChunk {
  id: string
  documentId: string
  content: string
  embedding?: number[]
  metadata?: Record<string, any>
}

// Error types
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
