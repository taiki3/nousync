import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withRls } from './lib/db.js'
import { getUserIdFromRequest } from './lib/auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const userId = await getUserIdFromRequest(req)
    const method = (req.method || 'GET').toUpperCase()

    if (method === 'GET') {
      // 一覧 or 単一
      const id = req.query?.id as string | undefined
      if (id) {
        const rows = await withRls(userId, (client) =>
          client.query(
            `SELECT id::text, user_id::text, project_id::text, title, content, summary, tags,
                    file_name, file_size, mime_type,
                    to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                    to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
             FROM documents WHERE id = $1`,
            [id],
          ),
        )
        if ((rows as any).rowCount === 0) {
          res.status(404).json({ status: 'error', error: 'Not found' })
          return
        }
        res.status(200).json({ status: 'success', data: (rows as any).rows[0] })
      } else {
        // シンプルなクエリでテスト
        try {
          const rows = await withRls(userId, (client) =>
            client.query(
              `SELECT id::text, title FROM documents LIMIT 10`
            ),
          )
          res.status(200).json({ status: 'success', data: (rows as any).rows })
        } catch (innerErr: any) {
          // デバッグ用：詳細なエラー情報を返す
          res.status(500).json({ 
            status: 'error', 
            error: innerErr.message,
            detail: innerErr.detail,
            hint: innerErr.hint,
            position: innerErr.position
          })
        }
      }
      return
    }

    if (method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
      const { title, content = '', projectId = null, tags = [] } = body
      if (!title) {
        res.status(400).json({ status: 'error', error: 'title is required' })
        return
      }
      const row = await withRls(userId, async (client) => {
        const { rows } = await client.query(
          `INSERT INTO documents (user_id, project_id, title, content, summary, tags)
           VALUES ($1, $2, $3, $4, NULL, $5)
           RETURNING id::text, user_id::text, project_id::text, title, content, summary, tags,
                     file_name, file_size, mime_type,
                     to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                     to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at`,
          [userId, projectId, title, content, JSON.stringify(tags)],
        )
        return rows[0]
      })
      res.status(201).json({ status: 'success', data: row })
      return
    }

    res.setHeader('Allow', 'GET,POST')
    res.status(405).end('Method Not Allowed')
  } catch (err: any) {
    const status = err?.statusCode || 500
    res.status(status).json({ 
      status: 'error', 
      error: err?.message || 'Internal error',
      // デバッグ情報
      detail: err?.detail,
      hint: err?.hint
    })
  }
}
