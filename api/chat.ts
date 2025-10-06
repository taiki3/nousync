import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'
import { withRls } from './lib/db.js'
import { getUserIdFromRequest } from './lib/auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const userId = await getUserIdFromRequest(req)
    const method = (req.method || 'POST').toUpperCase()
    if (method !== 'POST') {
      res.setHeader('Allow', 'POST')
      res.status(405).end('Method Not Allowed')
      return
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const { messages, useRag = false, projectId = null, maxTokens = 1000 } = body

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ status: 'error', error: 'messages array is required' })
      return
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      res.status(500).json({ status: 'error', error: 'OPENAI_API_KEY is not configured' })
      return
    }

    const openai = new OpenAI({ apiKey })
    let contextMessages = [...messages]

    // RAGコンテキスト生成
    if (useRag && messages.length > 0) {
      const lastUserMessage = [...messages].reverse().find((m: any) => m.role === 'user')
      if (lastUserMessage) {
        const query = lastUserMessage.content

        // クエリのembeddingを作成
        const embModel = process.env.EMBEDDING_MODEL || 'text-embedding-3-small'
        const emb = await openai.embeddings.create({ model: embModel, input: query })
        const vectorLiteral = `[${(emb.data[0].embedding as unknown as number[]).join(',')}]`

        // 関連チャンクを検索
        const params: any[] = [vectorLiteral]
        let where = 'true'
        if (projectId) {
          params.push(projectId)
          where += ` AND d.project_id = $${params.length}`
        }

        const chunks = await withRls(userId, async (client) => {
          const { rows } = await client.query(
            `SELECT e.document_id::text AS document_id,
                    d.title,
                    e.chunk_text,
                    1 - (e.embedding <=> $1::vector) AS similarity
             FROM embeddings e
             JOIN documents d ON d.id = e.document_id
             WHERE ${where}
             ORDER BY e.embedding <=> $1::vector ASC
             LIMIT 5`,
            params,
          )
          return rows
        })

        // コンテキストを追加
        if (chunks.length > 0) {
          const context = chunks
            .map((c: any) => `[${c.title}]\n${c.chunk_text}`)
            .join('\n\n---\n\n')

          const systemMessage = {
            role: 'system',
            content: `以下の関連情報を参考に回答してください:\n\n${context}`,
          }

          contextMessages = [systemMessage, ...messages]
        }
      }
    }

    // チャット完了APIを呼び出し
    const chatModel = process.env.CHAT_MODEL || 'gpt-4o-mini'
    const completion = await openai.chat.completions.create({
      model: chatModel,
      messages: contextMessages,
      max_tokens: maxTokens,
    })

    const response = {
      status: 'success',
      data: {
        message: completion.choices[0].message,
        usage: completion.usage,
      },
    }

    res.status(200).json(response)
  } catch (err: any) {
    const status = err?.statusCode || 500
    res.status(status).json({ status: 'error', error: err?.message || 'Internal error' })
  }
}
