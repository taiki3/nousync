import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getUserIdFromRequest } from '../../lib/auth.js'
import { getStorageClient, BUCKET_NAME } from '../../lib/storage.js'
import { extractText, isTextExtractionSupported } from '../../lib/text-extractor.js'
import { withRls } from '../../lib/db.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      res.status(405).end('Method Not Allowed')
      return
    }

    const userId = await getUserIdFromRequest(req)

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const { path, fileName, fileType, fileSize, projectId = null } = body

    if (!path) {
      res.status(400).json({
        status: 'error',
        error: 'path is required',
      })
      return
    }

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

    if (!fileSize) {
      res.status(400).json({
        status: 'error',
        error: 'fileSize is required',
      })
      return
    }

    // Download file from Supabase Storage
    const supabase = getStorageClient()
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(BUCKET_NAME)
      .download(path)

    if (downloadError || !fileData) {
      res.status(404).json({
        status: 'error',
        error: `File not found in storage: ${downloadError?.message || 'Unknown error'}`,
      })
      return
    }

    // Convert Blob to Buffer
    const arrayBuffer = await fileData.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Extract text if supported
    let content = ''
    let summary = ''

    if (isTextExtractionSupported(fileType)) {
      try {
        content = await extractText(buffer, fileType)

        // Generate summary (first 500 chars)
        summary = content.length > 500 ? content.substring(0, 500) + '...' : content
      } catch (err: any) {
        throw Object.assign(
          new Error(`Text extraction failed: ${err.message}`),
          { statusCode: 500 }
        )
      }
    } else {
      summary = `File uploaded: ${fileName} (${fileType})`
    }

    // Generate title from filename
    const title = fileName.replace(/\.[^/.]+$/, '') // Remove extension

    // Save to documents table
    const document = await withRls(userId, async (client) => {
      const { rows } = await client.query(
        `INSERT INTO documents (user_id, project_id, title, content, summary, file_name, file_size, mime_type, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id::text, user_id::text, project_id::text, title, content, summary, file_name, file_size, mime_type, tags,
                   to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
                   to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at`,
        [
          userId,
          projectId,
          title,
          content,
          summary,
          fileName,
          fileSize,
          fileType,
          JSON.stringify(['uploaded']),
        ]
      )
      return rows[0]
    })

    res.status(200).json({
      status: 'success',
      data: document,
    })
  } catch (err: any) {
    console.error('Upload completion handler error:', err)
    const status = err?.statusCode || 500
    res.status(status).json({
      status: 'error',
      error: err?.message || 'Internal error',
    })
  }
}
