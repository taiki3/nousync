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

    // 利用可能なモデル一覧（環境変数でAPIキーが設定されているものだけを表示）
    const models = []

    // OpenAI models
    if (process.env.OPENAI_API_KEY) {
      models.push(
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
        }
      )
    }

    // Anthropic Claude models
    if (process.env.ANTHROPIC_API_KEY) {
      models.push(
        {
          modelId: 'claude-3-opus-20240229',
          displayName: 'Claude 3 Opus',
          provider: 'anthropic',
        },
        {
          modelId: 'claude-3-sonnet-20240229',
          displayName: 'Claude 3 Sonnet',
          provider: 'anthropic',
        },
        {
          modelId: 'claude-3-haiku-20240307',
          displayName: 'Claude 3 Haiku',
          provider: 'anthropic',
        },
        {
          modelId: 'claude-3-5-sonnet-20241022',
          displayName: 'Claude 3.5 Sonnet',
          provider: 'anthropic',
        }
      )
    }

    // Google Gemini models
    if (process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY) {
      models.push(
        {
          modelId: 'gemini-1.5-pro',
          displayName: 'Gemini 1.5 Pro',
          provider: 'google',
        },
        {
          modelId: 'gemini-1.5-flash',
          displayName: 'Gemini 1.5 Flash',
          provider: 'google',
        },
        {
          modelId: 'gemini-pro',
          displayName: 'Gemini Pro',
          provider: 'google',
        }
      )
    }

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
