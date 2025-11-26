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

// Cloudflare Gateway configuration
const GATEWAY_URL = process.env.CLOUDFLARE_GATEWAY_URL
const GATEWAY_TOKEN = process.env.CLOUDFLARE_GATEWAY_TOKEN
const USE_GATEWAY = !!(GATEWAY_URL && GATEWAY_TOKEN)

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

    if (USE_GATEWAY) {
      // Use Cloudflare Gateway as base URL
      openaiClient = new OpenAI({
        apiKey,
        baseURL: `${GATEWAY_URL}/openai`,
        defaultHeaders: {
          'cf-aig-authorization': `Bearer ${GATEWAY_TOKEN}`
        }
      })
    } else {
      openaiClient = new OpenAI({ apiKey })
    }
  }
  return openaiClient
}

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('Anthropic API key not configured')
    }

    if (USE_GATEWAY) {
      // Use Cloudflare Gateway as base URL
      anthropicClient = new Anthropic({
        apiKey,
        baseURL: `${GATEWAY_URL}/anthropic`,
        defaultHeaders: {
          'cf-aig-authorization': `Bearer ${GATEWAY_TOKEN}`
        }
      })
    } else {
      anthropicClient = new Anthropic({ apiKey })
    }
  }
  return anthropicClient
}

function getGeminiClient(): GoogleGenerativeAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY
    if (!apiKey) {
      throw new Error('Gemini API key not configured')
    }
    // Note: Gemini SDK doesn't support custom base URL, we'll handle it differently
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

  /**
   * Create streaming chat completion with specified provider and model
   */
  static async *createChatCompletionStream(
    messages: ChatMessage[],
    modelId: string,
    provider: string,
    contextDocuments?: string
  ): AsyncGenerator<string, void, unknown> {
    // Add context to system message if provided
    const systemMessage = messages.find(m => m.role === 'system')
    if (contextDocuments && systemMessage) {
      systemMessage.content = `${systemMessage.content}\n\nHere are the relevant documents:\n\n${contextDocuments}\n\nPlease answer based on these documents.`
    }

    switch (provider) {
      case 'openai':
        yield* this.createOpenAIStream(messages, modelId)
        break
      case 'anthropic':
        yield* this.createAnthropicStream(messages, modelId)
        break
      case 'google':
        yield* this.createGeminiStream(messages, modelId)
        break
      default:
        throw new Error(`Provider ${provider} not supported`)
    }
  }

  private static async createOpenAICompletion(
    messages: ChatMessage[],
    modelId: string
  ): Promise<string> {
    const client = getOpenAIClient()

    // Use max_completion_tokens for newer models (gpt-4o, etc)
    // and max_tokens for older models
    const params: any = {
      model: modelId,
      messages: messages as any,
      temperature: 0.7,
    }

    // GPT-4o, GPT-4-turbo, GPT-5.x use max_completion_tokens
    if (modelId.includes('gpt-4o') || modelId.includes('gpt-4-turbo') || modelId.includes('gpt-5')) {
      params.max_completion_tokens = 2000
    } else {
      params.max_tokens = 2000
    }

    const completion = await client.chat.completions.create(params)

    return completion.choices[0]?.message?.content || ''
  }

  private static async *createOpenAIStream(
    messages: ChatMessage[],
    modelId: string
  ): AsyncGenerator<string, void, unknown> {
    const client = getOpenAIClient()

    const params: any = {
      model: modelId,
      messages: messages as any,
      temperature: 0.7,
      stream: true,
    }

    // GPT-4o, GPT-4-turbo, GPT-5.x use max_completion_tokens
    if (modelId.includes('gpt-4o') || modelId.includes('gpt-4-turbo') || modelId.includes('gpt-5')) {
      params.max_completion_tokens = 2000
    } else {
      params.max_tokens = 2000
    }

    const stream = await client.chat.completions.create(params)

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content
      if (content) {
        yield content
      }
    }
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

  private static async *createAnthropicStream(
    messages: ChatMessage[],
    modelId: string
  ): AsyncGenerator<string, void, unknown> {
    const client = getAnthropicClient()

    const systemMessage = messages.find(m => m.role === 'system')?.content || ''
    const userMessages = messages.filter(m => m.role !== 'system')

    const stream = await client.messages.create({
      model: modelId,
      max_tokens: 2000,
      temperature: 0.7,
      system: systemMessage,
      messages: userMessages.map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      })) as any,
      stream: true,
    })

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        yield chunk.delta.text
      }
    }
  }

  private static async createGeminiCompletion(
    messages: ChatMessage[],
    modelId: string
  ): Promise<string> {
    // If using Cloudflare Gateway, make direct HTTP request
    if (USE_GATEWAY) {
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY
      if (!apiKey) {
        throw new Error('Gemini API key not configured')
      }

      // Convert messages to Gemini format
      const contents = messages.map(m => ({
        role: m.role === 'system' ? 'user' : m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }))

      const response = await fetch(`${GATEWAY_URL}/google-ai-studio/v1/models/${modelId}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
          'cf-aig-authorization': `Bearer ${GATEWAY_TOKEN}`
        },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2000,
          }
        })
      })

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.statusText}`)
      }

      const data = await response.json()
      return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    }

    // Fallback to direct SDK usage
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

  private static async *createGeminiStream(
    messages: ChatMessage[],
    modelId: string
  ): AsyncGenerator<string, void, unknown> {
    // If using Cloudflare Gateway, streaming via HTTP
    if (USE_GATEWAY) {
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY
      if (!apiKey) {
        throw new Error('Gemini API key not configured')
      }

      const contents = messages.map(m => ({
        role: m.role === 'system' ? 'user' : m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }))

      const response = await fetch(`${GATEWAY_URL}/google-ai-studio/v1/models/${modelId}:streamGenerateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
          'cf-aig-authorization': `Bearer ${GATEWAY_TOKEN}`
        },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2000,
          }
        })
      })

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.statusText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text
              if (text) yield text
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } else {
      // Fallback to SDK streaming
      const client = getGeminiClient()
      const model = client.getGenerativeModel({ model: modelId })

      const history = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }],
        }))

      const chat = model.startChat({
        history: history.slice(0, -1),
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2000,
        },
      })

      const lastMessage = messages[messages.length - 1]
      const result = await chat.sendMessageStream(lastMessage.content)

      for await (const chunk of result.stream) {
        const text = chunk.text()
        if (text) yield text
      }
    }
  }

  /**
   * Fetch OpenAI models dynamically
   */
  private static async fetchOpenAIModels(): Promise<AIModel[]> {
    try {
      const client = getOpenAIClient()
      const response = await client.models.list()

      // Filter for GPT-5.1 models only
      const chatModels = response.data
        .filter(model =>
          model.id.includes('gpt-5.1') &&
          !model.id.includes('chat-latest') // exclude aliases
        )
        .map(model => ({
          provider: 'openai',
          modelId: model.id,
          displayName: model.id.replace('gpt-5.1', 'GPT-5.1').replace(/-/g, ' ').replace('codex', 'Codex').replace('mini', 'Mini')
        }))

      return chatModels.length > 0 ? chatModels : this.getDefaultOpenAIModels()
    } catch (error) {
      console.error('Failed to fetch OpenAI models:', error)
      return this.getDefaultOpenAIModels()
    }
  }

  private static getDefaultOpenAIModels(): AIModel[] {
    return [
      { provider: 'openai', modelId: 'gpt-5.1', displayName: 'GPT-5.1' },
      { provider: 'openai', modelId: 'gpt-5.1-codex', displayName: 'GPT-5.1 Codex' },
      { provider: 'openai', modelId: 'gpt-5.1-codex-mini', displayName: 'GPT-5.1 Codex Mini' }
    ]
  }

  /**
   * Fetch Gemini models dynamically
   */
  private static async fetchGeminiModels(): Promise<AIModel[]> {
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY
      if (!apiKey) return []

      // Use Cloudflare Gateway if configured
      const url = USE_GATEWAY
        ? `${GATEWAY_URL}/google-ai-studio/v1/models`
        : `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`

      const headers: any = {
        'Content-Type': 'application/json'
      }

      if (USE_GATEWAY) {
        headers['x-goog-api-key'] = apiKey
        headers['cf-aig-authorization'] = `Bearer ${GATEWAY_TOKEN}`
      }

      const response = await fetch(url, { headers })

      if (!response.ok) {
        throw new Error('Failed to fetch Gemini models')
      }

      const data = await response.json()

      if (data?.models) {
        return data.models
          .filter((model: any) => {
            const name = model.name?.toLowerCase() || ''
            const supportedMethods = model.supportedGenerationMethods || []

            // チャットモデルのみを選択（Gemini 2.5系、3.0系）
            const isChatModel = supportedMethods.includes('generateContent') &&
              !name.includes('embedding') &&
              !name.includes('aqa') &&  // AQA (Attributed Question Answering) モデルを除外
              !name.includes('tts') &&  // TTSモデルを除外
              !name.includes('image') &&  // 画像生成モデルを除外
              !name.includes('computer-use') &&  // Computer Useモデルを除外
              !name.includes('gemma') &&  // Gemmaモデルを除外
              (
                // Gemini 2.5系
                (name.includes('gemini') && (name.includes('2.5') || name.includes('2-5'))) ||
                // Gemini 3.0系
                (name.includes('gemini-3') || name.includes('gemini-3.0'))
              )

            return isChatModel
          })
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
      { provider: 'google', modelId: 'gemini-3-pro-preview', displayName: 'Gemini 3 Pro' },
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
        { provider: 'anthropic', modelId: 'claude-sonnet-4-5', displayName: 'Claude Sonnet 4.5' },
        { provider: 'anthropic', modelId: 'claude-haiku-4-5', displayName: 'Claude Haiku 4.5' },
        { provider: 'anthropic', modelId: 'claude-opus-4-5', displayName: 'Claude Opus 4.5' }
      )
    }

    // Gemini models - try dynamic fetch
    if (process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY) {
      const geminiModels = await this.fetchGeminiModels()
      models.push(...geminiModels)
    }

    return models
  }

  /**
   * Create research with Gemini using Google Search grounding
   * This enables the model to search the web and provide cited answers
   */
  static async createResearchWithGemini(
    topic: string,
    depth: 'shallow' | 'medium' | 'deep',
    modelId: 'gemini-2.5-flash' | 'gemini-2.5-pro',
    existingContext?: string
  ): Promise<{ content: string; sources: Array<{ url: string; title: string }> }> {
    const client = getGeminiClient()

    // Use specified Gemini model for research (both support grounding)
    const model = client.getGenerativeModel({
      model: modelId,
      tools: [{
        googleSearch: {}
      }]
    })

    const depthInstructions = {
      shallow: 'Provide a brief overview with key points (around 300-500 words).',
      medium: 'Provide a comprehensive analysis with detailed information (around 800-1200 words).',
      deep: 'Provide an in-depth, thorough research with multiple perspectives, examples, and references (around 1500-2500 words).'
    }

    const instruction = depthInstructions[depth] || depthInstructions.medium

    let prompt = `You are a research assistant with access to web search. Create a comprehensive research document on the following topic:

Topic: ${topic}

${instruction}

Structure your response as a well-organized document with:
1. Clear title
2. Executive summary
3. Main sections with headings
4. Key findings and insights
5. Conclusion
6. References (cite your sources from web search)

Please provide the research in markdown format with proper citations.`

    if (existingContext) {
      prompt += `\n\nExisting related documents for context:\n${existingContext}`
    }

    const result = await model.generateContent(prompt)
    const content = result.response.text()

    // Extract grounding metadata for sources
    const sources: Array<{ url: string; title: string }> = []
    const candidate = (result.response as any).candidates?.[0]
    const groundingMetadata = candidate?.groundingMetadata

    if (groundingMetadata?.groundingChunks) {
      for (const chunk of groundingMetadata.groundingChunks) {
        if (chunk.web?.uri && chunk.web?.title) {
          sources.push({
            url: chunk.web.uri,
            title: chunk.web.title
          })
        }
      }
    }

    return { content, sources }
  }
}