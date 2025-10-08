import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getUserIdFromRequest } from '../../../lib/auth.js'
import { withRls } from '../../../lib/db.js'
import { AIProvider } from '../../../lib/ai-providers.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      res.status(405).end('Method Not Allowed')
      return
    }

    const userId = await getUserIdFromRequest(req)
    const conversationId = req.query.conversationId as string

    if (!conversationId) {
      res.status(400).json({ status: 'error', error: 'conversationId is required' })
      return
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const { message, model = 'gpt-4o-mini', documentIds = [] } = body

    if (!message) {
      res.status(400).json({ status: 'error', error: 'Message is required' })
      return
    }

    // Check conversation exists and save user message
    await withRls(userId, async (client) => {
      const { rowCount } = await client.query(
        'SELECT 1 FROM conversations WHERE id = $1',
        [conversationId]
      )

      if (rowCount === 0) {
        throw Object.assign(new Error('Conversation not found'), { statusCode: 404 })
      }

      await client.query(
        `INSERT INTO messages (conversation_id, role, content)
         VALUES ($1, 'user', $2)`,
        [conversationId, message]
      )
    })

    // Get document context if needed
    let contextContent = ''
    if (documentIds && documentIds.length > 0) {
      const documents = await withRls(userId, async (client) => {
        const { rows } = await client.query(
          `SELECT title, content FROM documents WHERE id = ANY($1)`,
          [documentIds]
        )
        return rows
      })

      if (documents.length > 0) {
        contextContent = '\n\n以下のドキュメントを参考にして回答してください：\n\n'
        documents.forEach((doc: any) => {
          contextContent += `【${doc.title}】\n${doc.content}\n\n`
        })
      }
    }

    // Generate AI response
    try {
      const models = await AIProvider.getAvailableModels()
      const selectedModel = models.find(m => m.modelId === model)

      if (!selectedModel) {
        throw new Error(`Model ${model} not found`)
      }

      const messages = [
        { role: 'system' as const, content: 'You are a helpful assistant.' },
        { role: 'user' as const, content: message }
      ]

      const assistantMessage = await AIProvider.createChatCompletion(
        messages,
        selectedModel.modelId,
        selectedModel.provider,
        contextContent || undefined
      )

      // Save assistant message
      await withRls(userId, async (client) => {
        await client.query(
          `INSERT INTO messages (conversation_id, role, content)
           VALUES ($1, 'assistant', $2)`,
          [conversationId, assistantMessage]
        )

        await client.query(
          'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
          [conversationId]
        )
      })

      res.status(200).json({
        status: 'success',
        data: {
          response: assistantMessage,
          conversationId: conversationId,
          model: model
        }
      })
    } catch (aiError: any) {
      console.error('AI Provider error:', aiError)
      res.status(500).json({
        status: 'error',
        error: 'Failed to generate response',
        details: aiError?.message || 'Unknown AI provider error'
      })
    }
  } catch (err: any) {
    const status = err?.statusCode || 500
    res.status(status).json({ status: 'error', error: err?.message || 'Internal error' })
  }
}