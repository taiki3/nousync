import { withRls } from '../lib/db.js'
import { getUserIdFromRequest } from '../lib/auth.js'

export default async function handler(req: any, res: any) {
  try {
    const userId = await getUserIdFromRequest(req)

    const q = (req.query?.q || req.body?.q || '').toString().trim()
    if (!q) {
      res.status(400).json({ status: 'error', error: 'Query parameter q is required' })
      return
    }

    // PGroongaはSupabase Cloudで未対応の可能性が高いため既定はpg_trgm検索
    const usePGroonga = (process.env.USE_PGROONGA || 'false').toLowerCase() === 'true'

    let sql: string
    if (usePGroonga) {
      // PGroonga: 日本語に強い全文検索
      // `&@` はPGroongaのマッチ演算子
      sql = `
        SELECT id::text,
               title,
               LEFT(content, 200) AS snippet,
               to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
               pgroonga_score(tableoid, ctid) AS score
        FROM documents
        WHERE user_id = $2
          AND ((title &@ $1) OR (content &@ $1))
        ORDER BY score DESC NULLS LAST, created_at DESC
        LIMIT 20
      `
    } else {
      // pg_trgm による日本語向け近似検索（タイトル/本文）
      sql = `
        SELECT id::text,
               title,
               LEFT(content, 200) AS snippet,
               to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
        FROM documents
        WHERE user_id = $2
          AND (title ILIKE '%' || $1 || '%' OR content ILIKE '%' || $1 || '%')
        ORDER BY GREATEST(similarity(title, $1), similarity(content, $1)) DESC NULLS LAST
        LIMIT 20
      `
    }

    const rows = await withRls(userId, async (client) => {
      const { rows } = await client.query(sql, [q, userId])
      return rows
    })
    res.status(200).json({ status: 'success', data: rows })
  } catch (err: any) {
    const status = err?.statusCode || 500
    res.status(status).json({ status: 'error', error: err?.message || 'Internal error' })
  }
}
