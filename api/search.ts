import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'
import { withRls, withRlsRead } from './lib/db.js'
import { getUserIdFromRequest } from './lib/auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const userId = await getUserIdFromRequest(req)

    const q = (req.query?.q || req.body?.q || '').toString().trim()
    const type = (req.query?.type || 'keyword').toString() // 'keyword' | 'vector' | 'hybrid'
    const projectId = (req.query?.projectId || '').toString() || null

    if (!q) {
      res.status(400).json({ status: 'error', error: 'Query parameter q is required' })
      return
    }

    // Keyword search (default)
    if (type === 'keyword') {
      const usePGroonga = (process.env.USE_PGROONGA || 'false').toLowerCase() === 'true'

      let sql: string
      if (usePGroonga) {
        // PGroonga: 日本語に強い全文検索
        sql = `
          SELECT id::text,
                 title,
                 LEFT(content, 200) AS snippet,
                 to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                 pgroonga_score(tableoid, ctid) AS score
          FROM documents
          WHERE TRUE
            AND ((title &@ $1) OR (content &@ $1))
          ORDER BY score DESC NULLS LAST, created_at DESC
          LIMIT 10
        `
      } else {
        // pg_trgm: 標準的な類似度検索
        sql = `
          SELECT id::text,
                 title,
                 LEFT(content, 200) AS snippet,
                 to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                 GREATEST(
                   similarity(title, $1),
                   similarity(content, $1)
                 ) AS score
          FROM documents
          WHERE TRUE
            AND (
              title % $1
              OR content % $1
              OR title ILIKE '%' || $1 || '%'
              OR content ILIKE '%' || $1 || '%'
            )
          ORDER BY score DESC NULLS LAST, created_at DESC
          LIMIT 10
        `
      }

      const result = await withRlsRead(userId, async (client) => {
        const { rows } = await client.query(sql, [q])
        return rows
      })

      res.status(200).json({
        status: 'success',
        data: result,
        searchType: 'keyword',
        engine: usePGroonga ? 'pgroonga' : 'pg_trgm'
      })
      return
    }

    // Vector search
    if (type === 'vector') {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) {
        res.status(500).json({ status: 'error', error: 'OpenAI API key not configured for vector search' })
        return
      }

      const openai = new OpenAI({ apiKey })
      const model = process.env.EMBEDDING_MODEL || 'text-embedding-3-small'

      // Generate embedding for query
      const embeddingResponse = await openai.embeddings.create({
        model,
        input: q,
      })
      const queryEmbedding = embeddingResponse.data[0].embedding

      // Search by vector similarity
      const result = await withRlsRead(userId, async (client) => {
        const sql = projectId
          ? `SELECT id::text, title, LEFT(content, 200) AS snippet,
                    embedding <=> $1::vector AS distance
             FROM documents
             WHERE project_id = $2
             ORDER BY distance
             LIMIT 10`
          : `SELECT id::text, title, LEFT(content, 200) AS snippet,
                    embedding <=> $1::vector AS distance
             FROM documents
             ORDER BY distance
             LIMIT 10`

        const params = projectId
          ? [`[${queryEmbedding.join(',')}]`, projectId]
          : [`[${queryEmbedding.join(',')}]`]

        const { rows } = await client.query(sql, params)
        return rows
      })

      res.status(200).json({
        status: 'success',
        data: result,
        searchType: 'vector',
        model
      })
      return
    }

    res.status(400).json({ status: 'error', error: 'Invalid search type. Use keyword or vector.' })
  } catch (err: any) {
    const status = err?.statusCode || 500
    res.status(status).json({ status: 'error', error: err?.message || 'Internal error' })
  }
}