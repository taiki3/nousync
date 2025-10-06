import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withRls } from '../../lib/db.js'
import { getUserIdFromRequest } from '../../lib/auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const userId = await getUserIdFromRequest(req)
    const method = (req.method || 'GET').toUpperCase()

    if (method === 'GET') {
      // 会話一覧を取得
      const rows = await withRls(userId, (client) =>
        client.query(
          `SELECT id::text, user_id::text, title,
                  to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                  to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
           FROM conversations
           ORDER BY updated_at DESC
           LIMIT 100`,
        ),
      )
      res.status(200).json({ status: 'success', data: (rows as any).rows })
      return
    }

    if (method === 'POST') {
      // 新しい会話を作成
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
      const { title = 'New Conversation' } = body

      const row = await withRls(userId, async (client) => {
        const { rows } = await client.query(
          `INSERT INTO conversations (user_id, title)
           VALUES (auth.uid(), $1)
           RETURNING id::text, user_id::text, title,
                     to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                     to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at`,
          [title],
        )
        return rows[0]
      })

      res.status(201).json({
        status: 'success',
        data: { conversationId: row.id, ...row },
      })
      return
    }

    if (method === 'DELETE') {
      const id = req.query?.id as string | undefined
      if (!id) {
        res.status(400).json({ status: 'error', error: 'id query parameter is required' })
        return
      }

      const count = await withRls(userId, async (client) => {
        const { rowCount } = await client.query(`DELETE FROM conversations WHERE id = $1`, [id])
        return rowCount || 0
      })

      if (count === 0) {
        res.status(404).json({ status: 'error', error: 'Not found' })
        return
      }

      res.status(204).send('')
      return
    }

    res.setHeader('Allow', 'GET,POST,DELETE')
    res.status(405).end('Method Not Allowed')
  } catch (err: any) {
    const status = err?.statusCode || 500
    res.status(status).json({ status: 'error', error: err?.message || 'Internal error' })
  }
}
