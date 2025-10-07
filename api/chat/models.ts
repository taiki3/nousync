import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getUserIdFromRequest } from '../lib/auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // 認証チェック
    await getUserIdFromRequest(req)

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      res.status(405).end('Method Not Allowed')
      return
    }

    // 利用可能なモデル一覧（フロントエンドのAIModel型に合わせる）
    const models = [
      {
        modelId: 'gpt-4o',
        displayName: 'GPT-4o',
        provider: 'openai',
      },
      {
        modelId: 'gpt-4o-mini',
        displayName: 'GPT-4o Mini',
        provider: 'openai',
      },
      {
        modelId: 'gpt-4-turbo',
        displayName: 'GPT-4 Turbo',
        provider: 'openai',
      },
      {
        modelId: 'gpt-3.5-turbo',
        displayName: 'GPT-3.5 Turbo',
        provider: 'openai',
      },
    ]

    // キャッシュを無効化するヘッダーを設定
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')

    res.status(200).json({
      status: 'success',
      data: { models },
    })
  } catch (err: any) {
    const status = err?.statusCode || 500
    res.status(status).json({ status: 'error', error: err?.message || 'Internal error' })
  }
}
