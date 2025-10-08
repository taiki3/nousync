import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getUserIdFromRequest } from '../lib/auth.js'
import { withRls } from '../lib/db.js'
import { AIProvider } from '../lib/ai-providers.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const userId = await getUserIdFromRequest(req)
    const pathSegments = req.url?.split('/').filter(Boolean) || []

    // Route to appropriate handler based on path
    // /api/chat/models
    if (pathSegments.includes('models')) {
      return handleModels(req, res)
    }

    // /api/chat/conversations
    if (pathSegments.includes('conversations')) {
      const conversationId = pathSegments[pathSegments.indexOf('conversations') + 1]

      if (conversationId && pathSegments.includes('messages')) {
        // /api/chat/conversations/{id}/messages
        return handleMessages(req, res, userId, conversationId)
      }

      // /api/chat/conversations (list/create/delete)
      return handleConversations(req, res, userId)
    }

    res.status(404).json({ status: 'error', error: 'Not found' })
  } catch (err: any) {
    const status = err?.statusCode || 500
    res.status(status).json({ status: 'error', error: err?.message || 'Internal error' })
  }
}

async function handleModels(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).end('Method Not Allowed')
    return
  }

  const models = await AIProvider.getAvailableModels()

  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  res.status(200).json({
    status: 'success',
    data: { models },
  })
}

async function handleConversations(req: VercelRequest, res: VercelResponse, userId: string) {
  const method = (req.method || 'GET').toUpperCase()

  if (method === 'GET') {
    const rows = await withRls(userId, (client) =>
      client.query(
        `SELECT id::text, user_id::text, title,
                to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
         FROM conversations
         ORDER BY updated_at DESC
         LIMIT 100`,
      ),
    )
    res.status(200).json({ status: 'success', data: (rows as any).rows })
    return
  }

  if (method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const { title = 'New Conversation' } = body

    const row = await withRls(userId, async (client) => {
      const { rows } = await client.query(
        `INSERT INTO conversations (user_id, title)
         VALUES ($1, $2)
         RETURNING id::text, user_id::text, title,
                   to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                   to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at`,
        [userId, title],
      )
      return rows[0]
    })

    res.status(201).json({
      status: 'success',
      data: { conversationId: row.id, ...row },
    })
    return
  }

  if (method === 'DELETE') {
    const id = req.query?.id as string | undefined
    if (!id) {
      res.status(400).json({ status: 'error', error: 'id query parameter is required' })
      return
    }

    const count = await withRls(userId, async (client) => {
      const { rowCount } = await client.query(`DELETE FROM conversations WHERE id = $1`, [id])
      return rowCount || 0
    })

    if (count === 0) {
      res.status(404).json({ status: 'error', error: 'Not found' })
      return
    }

    res.status(204).send('')
    return
  }

  res.setHeader('Allow', 'GET,POST,DELETE')
  res.status(405).end('Method Not Allowed')
}

async function handleMessages(
  req: VercelRequest,
  res: VercelResponse,
  userId: string,
  conversationId: string
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).end('Method Not Allowed')
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
}