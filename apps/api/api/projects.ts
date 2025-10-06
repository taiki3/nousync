import { withRls } from '../lib/db.js'
import { getUserIdFromRequest } from '../lib/auth.js'

export default async function handler(req: any, res: any) {
  try {
    const userId = await getUserIdFromRequest(req)
    const method = (req.method || 'GET').toUpperCase()
    const action = (req.query?.action || '').toString()

    if (method === 'GET') {
      if (action === 'ensureDefault') {
        const row = await withRls(userId, async (client) => {
          // 既存のデフォルトがあれば返す、なければ作成
          const ex = await client.query(
            `SELECT id::text, user_id::text, name, description, color, is_default,
                    to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                    to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
             FROM projects WHERE is_default = true LIMIT 1`,
          )
          if (ex.rowCount > 0) return ex.rows[0]
          const ins = await client.query(
            `INSERT INTO projects (user_id, name, description, color, is_default)
             VALUES (auth.uid(), 'Default', NULL, NULL, true)
             RETURNING id::text, user_id::text, name, description, color, is_default,
                       to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                       to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at`,
          )
          return ins.rows[0]
        })
        res.status(200).json({ status: 'success', data: row })
        return
      }

      // 一覧
      const rows = await withRls(userId, (client) =>
        client.query(
          `SELECT id::text, user_id::text, name, description, color, is_default,
                  to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                  to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
           FROM projects ORDER BY created_at DESC LIMIT 100`,
        ),
      )
      res.status(200).json({ status: 'success', data: rows.rows })
      return
    }

    if (method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
      const { name, description = null, color = null, isDefault = false } = body
      if (!name) {
        res.status(400).json({ status: 'error', error: 'name is required' })
        return
      }
      const row = await withRls(userId, async (client) => {
        const { rows } = await client.query(
          `INSERT INTO projects (user_id, name, description, color, is_default)
           VALUES (auth.uid(), $1, $2, $3, $4)
           RETURNING id::text, user_id::text, name, description, color, is_default,
                     to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                     to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at`,
          [name, description, color, !!isDefault],
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
      const { name, description, color, isDefault } = body
      const fields: string[] = []
      const params: any[] = []
      if (name !== undefined) {
        params.push(name)
        fields.push(`name = $${params.length}`)
      }
      if (description !== undefined) {
        params.push(description)
        fields.push(`description = $${params.length}`)
      }
      if (color !== undefined) {
        params.push(color)
        fields.push(`color = $${params.length}`)
      }
      if (isDefault !== undefined) {
        params.push(!!isDefault)
        fields.push(`is_default = $${params.length}`)
      }
      if (!fields.length) {
        res.status(400).json({ status: 'error', error: 'no fields to update' })
        return
      }
      params.push(id)
      const row = await withRls(userId, async (client) => {
        const { rows } = await client.query(
          `UPDATE projects SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING 
             id::text, user_id::text, name, description, color, is_default,
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
        const { rowCount } = await client.query(`DELETE FROM projects WHERE id = $1`, [id])
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
