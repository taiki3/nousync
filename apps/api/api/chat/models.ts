import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getUserIdFromRequest } from '../../lib/auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // 認証チェック
    await getUserIdFromRequest(req)

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      res.status(405).end('Method Not Allowed')
      return
    }

    // 利用可能なモデル一覧
    const models = [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        description: 'Most capable model, best for complex tasks',
        provider: 'openai',
        contextWindow: 128000,
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        description: 'Fast and efficient, good for most tasks',
        provider: 'openai',
        contextWindow: 128000,
      },
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        description: 'Previous generation flagship model',
        provider: 'openai',
        contextWindow: 128000,
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        description: 'Fast and cost-effective',
        provider: 'openai',
        contextWindow: 16385,
      },
    ]

    res.status(200).json({
      status: 'success',
      data: { models },
    })
  } catch (err: any) {
    const status = err?.statusCode || 500
    res.status(status).json({ status: 'error', error: err?.message || 'Internal error' })
  }
}
