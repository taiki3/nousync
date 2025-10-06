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
        const projectId = (req.query?.projectId || '').toString() || null
        const params: any[] = []
        let where = 'user_id = auth.uid()' // RLSがあるため冗長だが明示
        if (projectId) {
          where += ' AND project_id = $1'
          params.push(projectId)
        }
        const rows = await withRls(userId, (client) =>
          client.query(
            `SELECT id::text, user_id::text, project_id::text, title, content, summary, tags,
                    file_name, file_size, mime_type,
                    to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                    to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
             FROM documents
             ${params.length ? 'WHERE ' + where : ''}
             ORDER BY created_at DESC
             LIMIT 100`,
            params,
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
           VALUES (auth.uid(), $1, $2, $3, NULL, $4)
           RETURNING id::text, user_id::text, project_id::text, title, content, summary, tags,
                     file_name, file_size, mime_type,
                     to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                     to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at`,
          [projectId, title, content, JSON.stringify(tags)],
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
      const { title, content, summary, tags, projectId } = body
      const fields: string[] = []
      const params: any[] = []
      if (title !== undefined) {
        params.push(title)
        fields.push(`title = $${params.length}`)
      }
      if (content !== undefined) {
        params.push(content)
        fields.push(`content = $${params.length}`)
      }
      if (summary !== undefined) {
        params.push(summary)
        fields.push(`summary = $${params.length}`)
      }
      if (tags !== undefined) {
        params.push(JSON.stringify(tags))
        fields.push(`tags = $${params.length}`)
      }
      if (projectId !== undefined) {
        params.push(projectId)
        fields.push(`project_id = $${params.length}`)
      }
      if (!fields.length) {
        res.status(400).json({ status: 'error', error: 'no fields to update' })
        return
      }
      params.push(id)
      const row = await withRls(userId, async (client) => {
        const { rows } = await client.query(
          `UPDATE documents SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING 
             id::text, user_id::text, project_id::text, title, content, summary, tags,
             file_name, file_size, mime_type,
             to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
             to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at`,
          params,
        )
        return rows[0]
      })
      if (!row) {
        res.status(404).json({ status: 'error', error: 'Not found' })
        return
      }
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
        res.status(404).json({ status: 'error', error: 'Not found' })
        return
      }
      res.status(204).send('')
      return
    }

    res.setHeader('Allow', 'GET,POST,PUT,DELETE')
    res.status(405).end('Method Not Allowed')
  } catch (err: any) {
    const status = err?.statusCode || 500
    res.status(status).json({ status: 'error', error: err?.message || 'Internal error' })
  }
}
