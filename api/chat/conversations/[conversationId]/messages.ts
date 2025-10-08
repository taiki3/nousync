import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getUserIdFromRequest } from '../../../lib/auth.js'
import { withRls } from '../../../lib/db.js'
import { AIProvider } from '../../../lib/ai-providers.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const userId = await getUserIdFromRequest(req)
    const { conversationId } = req.query

    if (!conversationId || typeof conversationId !== 'string') {
      res.status(400).json({ status: 'error', error: 'Invalid conversation ID' })
      return
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      res.status(405).end('Method Not Allowed')
      return
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}

    // デバッグ: リクエストボディを確認
    console.log('Request body type:', typeof req.body)
    console.log('Request body:', JSON.stringify(body))

    const { message, model = 'gpt-4o-mini', documentIds = [] } = body

    if (!message) {
      res.status(400).json({
        status: 'error',
        error: 'Message is required',
        debug: {
          bodyType: typeof req.body,
          bodyKeys: Object.keys(body),
          body: body
        }
      })
      return
    }

    // 会話の存在確認とメッセージ保存
    await withRls(userId, async (client) => {
      // 会話が存在するか確認
      const { rowCount } = await client.query(
        'SELECT 1 FROM conversations WHERE id = $1',
        [conversationId]
      )

      if (rowCount === 0) {
        throw Object.assign(new Error('Conversation not found'), { statusCode: 404 })
      }

      // ユーザーメッセージを保存
      await client.query(
        `INSERT INTO messages (conversation_id, role, content)
         VALUES ($1, 'user', $2)`,
        [conversationId, message]
      )
    })

    // documentIdsが指定されている場合、ドキュメントの内容を取得
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

    // AIプロバイダーを使用してレスポンスを生成
    let assistantMessage = ''
    try {
      // モデル一覧を取得してプロバイダーを特定
      const models = await AIProvider.getAvailableModels()
      const selectedModel = models.find(m => m.modelId === model)

      if (!selectedModel) {
        throw new Error(`Model ${model} not found`)
      }

      const systemMessage = 'You are a helpful assistant.'
      const userMessageContent = message

      const messages = [
        { role: 'system' as const, content: systemMessage },
        { role: 'user' as const, content: userMessageContent }
      ]

      assistantMessage = await AIProvider.createChatCompletion(
        messages,
        selectedModel.modelId,
        selectedModel.provider,
        contextContent || undefined
      )

      // アシスタントメッセージを保存
      await withRls(userId, async (client) => {
        await client.query(
          `INSERT INTO messages (conversation_id, role, content)
           VALUES ($1, 'assistant', $2)`,
          [conversationId, assistantMessage]
        )

        // 会話の更新日時を更新
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
    console.error('Chat error:', err)
    const status = err?.statusCode || 500
    res.status(status).json({
      status: 'error',
      error: err?.message || 'Internal error'
    })
  }
}