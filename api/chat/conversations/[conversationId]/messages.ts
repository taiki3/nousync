import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getUserIdFromRequest } from '../../../lib/auth.js'
import { withRls } from '../../../lib/db.js'
import OpenAI from 'openai'

// OpenAI APIキーの確認
if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is not set in environment variables')
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-error-handling',
})

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

    // OpenAI APIを呼び出し
    try {
      const completion = await openai.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 2000,
      })

      const assistantMessage = completion.choices[0]?.message?.content || ''

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
    } catch (openaiError: any) {
      console.error('OpenAI API error:', openaiError)
      res.status(500).json({
        status: 'error',
        error: 'Failed to generate response',
        details: openaiError?.message || 'Unknown OpenAI error',
        apiKeyPresent: !!process.env.OPENAI_API_KEY,
        apiKeyLength: process.env.OPENAI_API_KEY?.length || 0
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