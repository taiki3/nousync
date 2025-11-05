import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getUserIdFromRequest } from '../../lib/auth.js'
import { getStorageClient, isAllowedFileType, generateStoragePath, BUCKET_NAME } from '../../lib/storage.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      res.status(405).end('Method Not Allowed')
      return
    }

    const userId = await getUserIdFromRequest(req)

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const { fileName, fileType } = body

    if (!fileName) {
      res.status(400).json({
        status: 'error',
        error: 'fileName is required',
      })
      return
    }

    if (!fileType) {
      res.status(400).json({
        status: 'error',
        error: 'fileType is required',
      })
      return
    }

    if (!isAllowedFileType(fileType)) {
      res.status(400).json({
        status: 'error',
        error: `file type not allowed: ${fileType}`,
      })
      return
    }

    const storagePath = generateStoragePath(userId, fileName)
    const supabase = getStorageClient()

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUploadUrl(storagePath)

    if (error) {
      throw Object.assign(new Error(`Failed to create signed upload URL: ${error.message}`), {
        statusCode: 500,
      })
    }

    if (!data) {
      throw Object.assign(new Error('No data returned from Supabase'), { statusCode: 500 })
    }

    res.status(200).json({
      status: 'success',
      data: {
        uploadUrl: data.signedUrl,
        path: storagePath,
        token: data.token,
      },
    })
  } catch (err: any) {
    console.error('Upload URL handler error:', err)
    const status = err?.statusCode || 500
    res.status(status).json({
      status: 'error',
      error: err?.message || 'Internal error',
    })
  }
}
