import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AIModel {
  provider: string
  modelId: string
  displayName: string
}

// Provider clients (singleton pattern)
let openaiClient: OpenAI | null = null
let anthropicClient: Anthropic | null = null
let geminiClient: GoogleGenerativeAI | null = null

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OpenAI API key not configured')
    }
    openaiClient = new OpenAI({ apiKey })
  }
  return openaiClient
}

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('Anthropic API key not configured')
    }
    anthropicClient = new Anthropic({ apiKey })
  }
  return anthropicClient
}

function getGeminiClient(): GoogleGenerativeAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY
    if (!apiKey) {
      throw new Error('Gemini API key not configured')
    }
    geminiClient = new GoogleGenerativeAI(apiKey)
  }
  return geminiClient
}

export class AIProvider {
  /**
   * Create chat completion with specified provider and model
   */
  static async createChatCompletion(
    messages: ChatMessage[],
    modelId: string,
    provider: string,
    contextDocuments?: string
  ): Promise<string> {
    // Add context to system message if provided
    const systemMessage = messages.find(m => m.role === 'system')
    if (contextDocuments && systemMessage) {
      systemMessage.content = `${systemMessage.content}\n\nHere are the relevant documents:\n\n${contextDocuments}\n\nPlease answer based on these documents.`
    }

    switch (provider) {
      case 'openai':
        return this.createOpenAICompletion(messages, modelId)
      case 'anthropic':
        return this.createAnthropicCompletion(messages, modelId)
      case 'google':
        return this.createGeminiCompletion(messages, modelId)
      default:
        throw new Error(`Provider ${provider} not supported`)
    }
  }

  private static async createOpenAICompletion(
    messages: ChatMessage[],
    modelId: string
  ): Promise<string> {
    const client = getOpenAIClient()

    const completion = await client.chat.completions.create({
      model: modelId,
      messages: messages as any,
      temperature: 0.7,
      max_tokens: 2000,
    })

    return completion.choices[0]?.message?.content || ''
  }

  private static async createAnthropicCompletion(
    messages: ChatMessage[],
    modelId: string
  ): Promise<string> {
    const client = getAnthropicClient()

    // Convert messages to Anthropic format
    const systemMessage = messages.find(m => m.role === 'system')?.content || ''
    const userMessages = messages.filter(m => m.role !== 'system')

    const response = await client.messages.create({
      model: modelId,
      max_tokens: 2000,
      temperature: 0.7,
      system: systemMessage,
      messages: userMessages.map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      })) as any,
    })

    return response.content[0]?.type === 'text' ? response.content[0].text : ''
  }

  private static async createGeminiCompletion(
    messages: ChatMessage[],
    modelId: string
  ): Promise<string> {
    const client = getGeminiClient()
    const model = client.getGenerativeModel({ model: modelId })

    // Convert messages to Gemini format
    const history = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }))

    const chat = model.startChat({
      history: history.slice(0, -1), // All except last message
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2000,
      },
    })

    const lastMessage = messages[messages.length - 1]
    const result = await chat.sendMessage(lastMessage.content)

    return result.response.text()
  }

  /**
   * Fetch OpenAI models dynamically
   */
  private static async fetchOpenAIModels(): Promise<AIModel[]> {
    try {
      const client = getOpenAIClient()
      const response = await client.models.list()

      // Filter for chat models only
      const chatModels = response.data
        .filter(model =>
          model.id.includes('gpt') &&
          !model.id.includes('instruct') &&
          !model.id.includes('vision')
        )
        .map(model => ({
          provider: 'openai',
          modelId: model.id,
          displayName: model.id.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')
        }))

      return chatModels.length > 0 ? chatModels : this.getDefaultOpenAIModels()
    } catch (error) {
      console.error('Failed to fetch OpenAI models:', error)
      return this.getDefaultOpenAIModels()
    }
  }

  private static getDefaultOpenAIModels(): AIModel[] {
    return [
      { provider: 'openai', modelId: 'gpt-4o', displayName: 'GPT-4o' },
      { provider: 'openai', modelId: 'gpt-4o-mini', displayName: 'GPT-4o Mini' },
      { provider: 'openai', modelId: 'gpt-4-turbo', displayName: 'GPT-4 Turbo' },
      { provider: 'openai', modelId: 'gpt-3.5-turbo', displayName: 'GPT-3.5 Turbo' }
    ]
  }

  /**
   * Fetch Gemini models dynamically
   */
  private static async fetchGeminiModels(): Promise<AIModel[]> {
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY
      if (!apiKey) return []

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      )

      if (!response.ok) {
        throw new Error('Failed to fetch Gemini models')
      }

      const data = await response.json()

      if (data?.models) {
        return data.models
          .filter((model: any) =>
            model.supportedGenerationMethods?.includes('generateContent') &&
            !model.name?.includes('embedding') &&
            (model.name?.includes('2.5') || model.name?.includes('2-5'))  // Gemini 2.5系のみ
          )
          .map((model: any) => ({
            provider: 'google',
            modelId: model.name.replace('models/', ''),
            displayName: model.displayName || model.name
          }))
      }

      return this.getDefaultGeminiModels()
    } catch (error) {
      console.error('Failed to fetch Gemini models:', error)
      return this.getDefaultGeminiModels()
    }
  }

  private static getDefaultGeminiModels(): AIModel[] {
    return [
      { provider: 'google', modelId: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
      { provider: 'google', modelId: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' }
    ]
  }

  /**
   * Get available models for all configured providers
   * OpenAI and Gemini: Dynamic fetch with fallback
   * Anthropic: Static list (no API available)
   */
  static async getAvailableModels(): Promise<AIModel[]> {
    const models: AIModel[] = []

    // OpenAI models - try dynamic fetch
    if (process.env.OPENAI_API_KEY) {
      const openaiModels = await this.fetchOpenAIModels()
      models.push(...openaiModels)
    }

    // Anthropic models - static list (no list API available)
    if (process.env.ANTHROPIC_API_KEY) {
      models.push(
        { provider: 'anthropic', modelId: 'claude-3-5-sonnet-20241022', displayName: 'Claude 3.5 Sonnet' },
        { provider: 'anthropic', modelId: 'claude-3-opus-20240229', displayName: 'Claude 3 Opus' },
        { provider: 'anthropic', modelId: 'claude-3-sonnet-20240229', displayName: 'Claude 3 Sonnet' },
        { provider: 'anthropic', modelId: 'claude-3-haiku-20240307', displayName: 'Claude 3 Haiku' }
      )
    }

    // Gemini models - try dynamic fetch
    if (process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY) {
      const geminiModels = await this.fetchGeminiModels()
      models.push(...geminiModels)
    }

    return models
  }
}