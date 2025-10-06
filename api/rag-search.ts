import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'
import { withRls } from '../lib/db.js'
import { getUserIdFromRequest } from '../lib/auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const userId = await getUserIdFromRequest(req)
    const method = (req.method || 'GET').toUpperCase()
    if (method !== 'GET') {
      res.setHeader('Allow', 'GET')
      res.status(405).end('Method Not Allowed')
      return
    }

    const q = (req.query?.q || '').toString().trim()
    const projectId = (req.query?.projectId || '').toString() || null
    if (!q) {
      res.status(400).json({ status: 'error', error: 'q is required' })
      return
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      res.status(500).json({ status: 'error', error: 'OPENAI_API_KEY is not configured' })
      return
    }

    const openai = new OpenAI({ apiKey })
    const model = process.env.EMBEDDING_MODEL || 'text-embedding-3-small'
    const emb = await openai.embeddings.create({ model, input: q })
    const vectorLiteral = `[${(emb.data[0].embedding as unknown as number[]).join(',')}]`

    const params: any[] = [vectorLiteral]
    let where = 'true'
    if (projectId) {
      params.push(projectId)
      where += ` AND d.project_id = $${params.length}`
    }

    const rows = await withRls(userId, async (client) => {
      const { rows } = await client.query(
        `SELECT e.document_id::text AS document_id,
                d.title,
                e.chunk_text,
                1 - (e.embedding <=> $1::vector) AS similarity
         FROM embeddings e
         JOIN documents d ON d.id = e.document_id
         WHERE ${where}
         ORDER BY e.embedding <=> $1::vector ASC
         LIMIT 10`,
        params,
      )
      return rows
    })

    res.status(200).json({ status: 'success', data: rows })
  } catch (err: any) {
    const status = err?.statusCode || 500
    res.status(status).json({ status: 'error', error: err?.message || 'Internal error' })
  }
}
