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
        // 一覧取得（完全なデータ）
        const rows = await withRls(userId, (client) =>
          client.query(
            `SELECT id::text, user_id::text, project_id::text, title, content, summary, tags,
                    file_name, file_size, mime_type,
                    to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                    to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
             FROM documents
             ORDER BY updated_at DESC
             LIMIT 100`
          ),
        )
        res.status(200).json({ status: 'success', data: (rows as any).rows })
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

    if (method === 'PUT') {
      const id = req.query?.id as string | undefined
      if (!id) {
        res.status(400).json({ status: 'error', error: 'id query parameter is required' })
        return
      }
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
      const { title, content, summary, tags } = body

      const row = await withRls(userId, async (client) => {
        const { rows, rowCount } = await client.query(
          `UPDATE documents
           SET title = COALESCE($2, title),
               content = COALESCE($3, content),
               summary = COALESCE($4, summary),
               tags = COALESCE($5, tags),
               updated_at = NOW()
           WHERE id = $1
           RETURNING id::text, user_id::text, project_id::text, title, content, summary, tags,
                     file_name, file_size, mime_type,
                     to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                     to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at`,
          [id, title, content, summary, tags ? JSON.stringify(tags) : undefined],
        )
        if (rowCount === 0) {
          throw Object.assign(new Error('Document not found'), { statusCode: 404 })
        }
        return rows[0]
      })
      res.status(200).json({ status: 'success', data: row })
      return
    }

    if (method === 'DELETE') {
      const id = req.query?.id as string | undefined
      if (!id) {
        res.status(400).json({ status: 'error', error: 'id query parameter is required' })
        return
      }

      const count = await withRls(userId, async (client) => {
        const { rowCount } = await client.query(`DELETE FROM documents WHERE id = $1`, [id])
        return rowCount || 0
      })

      if (count === 0) {
        res.status(404).json({ status: 'error', error: 'Document not found' })
        return
      }

      res.status(204).send('')
      return
    }

    res.setHeader('Allow', 'GET,POST,PUT,DELETE')
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
