import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'
import { withRls } from './lib/db.js'
import { getUserIdFromRequest } from './lib/auth.js'

function chunkText(text: string, chunkSize = 1000): string[] {
  const chunks: string[] = []
  const sentences = text.match(/[^.!?。！？]+[.!?。！？]*/g) || [text]
  let current = ''
  for (const s of sentences) {
    if ((current + s).length > chunkSize && current) {
      chunks.push(current.trim())
      current = s
    } else {
      current += s
    }
  }
  if (current) chunks.push(current.trim())
  return chunks
}

async function createEmbedding(client: OpenAI, input: string): Promise<number[]> {
  const model = process.env.EMBEDDING_MODEL || 'text-embedding-3-small'
  const out = await client.embeddings.create({ model, input })
  return out.data[0].embedding as unknown as number[]
}

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
    const { documentId } = body
    if (!documentId) {
      res.status(400).json({ status: 'error', error: 'documentId is required' })
      return
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      res.status(500).json({ status: 'error', error: 'OPENAI_API_KEY is not configured' })
      return
    }

    const openai = new OpenAI({ apiKey })

    // ドキュメント取得 → 分割 → 既存Embedding削除 → 新規作成
    await withRls(userId, async (client) => {
      const doc = await client.query(
        `SELECT id::text, content FROM documents WHERE id = $1`,
        [documentId],
      )
      if (doc.rowCount === 0) throw Object.assign(new Error('Not found'), { statusCode: 404 })
      const content: string = doc.rows[0].content || ''
      const chunks = chunkText(content)

      await client.query(`DELETE FROM embeddings WHERE document_id = $1`, [documentId])
      let idx = 0
      for (const ch of chunks) {
        const emb = await createEmbedding(openai, ch)
        const vectorLiteral = `[${emb.join(',')}]`
        await client.query(
          `INSERT INTO embeddings (document_id, chunk_index, chunk_text, embedding)
           VALUES ($1, $2, $3, $4::vector)`,
          [documentId, idx++, ch, vectorLiteral],
        )
      }
    })

    res.status(200).json({ status: 'success' })
  } catch (err: any) {
    const status = err?.statusCode || 500
    res.status(status).json({ status: 'error', error: err?.message || 'Internal error' })
  }
}
