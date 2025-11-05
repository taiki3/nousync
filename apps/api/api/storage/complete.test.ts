import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import handler from './complete'

// Mock dependencies
vi.mock('../../lib/auth.js', () => ({
  getUserIdFromRequest: vi.fn(async (req: any) => {
    const auth = req.headers?.authorization || ''
    if (!auth.startsWith('Bearer ')) {
      throw Object.assign(new Error('Unauthorized'), { statusCode: 401 })
    }
    return 'test-user-id'
  }),
}))

vi.mock('../../lib/storage.js', () => ({
  getStorageClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        download: vi.fn(async (path: string) => {
          if (path.includes('not-found')) {
            return { data: null, error: { message: 'File not found' } }
          }
          const buffer = Buffer.from('Test file content')
          // Create a Blob-like object with arrayBuffer method
          const blobLike = {
            arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
          }
          return {
            data: blobLike,
            error: null,
          }
        }),
      })),
    },
  })),
  BUCKET_NAME: 'documents',
}))

vi.mock('../../lib/text-extractor.js', () => ({
  extractText: vi.fn(async (buffer: Buffer, mimeType: string) => {
    return `Extracted text from ${mimeType}: ${buffer.toString()}`
  }),
  isTextExtractionSupported: vi.fn((mimeType: string) => {
    return ['text/plain', 'application/pdf'].includes(mimeType)
  }),
}))

vi.mock('../../lib/db.js', () => ({
  withRls: vi.fn(async (userId: string, callback: any) => {
    const mockClient = {
      query: vi.fn(async (query: string, params: any[]) => {
        if (query.includes('INSERT')) {
          return {
            rows: [
              {
                id: 'doc-123',
                title: 'Test Document',
                user_id: userId,
              },
            ],
          }
        }
        return { rows: [] }
      }),
    }
    return callback(mockClient)
  }),
}))

describe('/api/storage/complete', () => {
  let req: Partial<VercelRequest>
  let res: Partial<VercelResponse>
  let jsonMock: ReturnType<typeof vi.fn>
  let statusMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    jsonMock = vi.fn()
    statusMock = vi.fn(() => ({ json: jsonMock, end: vi.fn() }))

    req = {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
      },
      body: {
        path: 'test-user-id/123456-abc123-document.pdf',
        fileName: 'document.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
      },
    }

    res = {
      status: statusMock,
      setHeader: vi.fn(),
    } as Partial<VercelResponse>
  })

  it('should return 405 for non-POST requests', async () => {
    req.method = 'GET'

    await handler(req as VercelRequest, res as VercelResponse)

    expect(statusMock).toHaveBeenCalledWith(405)
    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'POST')
  })

  it('should return 401 when authorization header is missing', async () => {
    req.headers = {}

    await handler(req as VercelRequest, res as VercelResponse)

    expect(statusMock).toHaveBeenCalledWith(401)
    expect(jsonMock).toHaveBeenCalledWith({
      status: 'error',
      error: expect.stringContaining('Unauthorized'),
    })
  })

  it('should return 400 when path is missing', async () => {
    req.body = { fileName: 'test.pdf', fileType: 'application/pdf', fileSize: 1024 }

    await handler(req as VercelRequest, res as VercelResponse)

    expect(statusMock).toHaveBeenCalledWith(400)
    expect(jsonMock).toHaveBeenCalledWith({
      status: 'error',
      error: expect.stringContaining('path'),
    })
  })

  it('should return 400 when fileName is missing', async () => {
    req.body = { path: 'user/file.pdf', fileType: 'application/pdf', fileSize: 1024 }

    await handler(req as VercelRequest, res as VercelResponse)

    expect(statusMock).toHaveBeenCalledWith(400)
    expect(jsonMock).toHaveBeenCalledWith({
      status: 'error',
      error: expect.stringContaining('fileName'),
    })
  })

  it('should return 400 when fileType is missing', async () => {
    req.body = { path: 'user/file.pdf', fileName: 'file.pdf', fileSize: 1024 }

    await handler(req as VercelRequest, res as VercelResponse)

    expect(statusMock).toHaveBeenCalledWith(400)
    expect(jsonMock).toHaveBeenCalledWith({
      status: 'error',
      error: expect.stringContaining('fileType'),
    })
  })

  it('should return 400 when fileSize is missing', async () => {
    req.body = { path: 'user/file.pdf', fileName: 'file.pdf', fileType: 'application/pdf' }

    await handler(req as VercelRequest, res as VercelResponse)

    expect(statusMock).toHaveBeenCalledWith(400)
    expect(jsonMock).toHaveBeenCalledWith({
      status: 'error',
      error: expect.stringContaining('fileSize'),
    })
  })

  it('should process upload and create document', async () => {
    await handler(req as VercelRequest, res as VercelResponse)

    expect(statusMock).toHaveBeenCalledWith(200)
    expect(jsonMock).toHaveBeenCalledWith({
      status: 'success',
      data: {
        id: 'doc-123',
        title: 'Test Document',
        user_id: 'test-user-id',
      },
    })
  })

  it('should return 404 when file not found in storage', async () => {
    req.body = {
      ...req.body,
      path: 'user/not-found.pdf',
    }

    await handler(req as VercelRequest, res as VercelResponse)

    expect(statusMock).toHaveBeenCalledWith(404)
    expect(jsonMock).toHaveBeenCalledWith({
      status: 'error',
      error: expect.stringContaining('File not found'),
    })
  })

  it('should handle text extraction errors gracefully', async () => {
    const { extractText } = await import('../../lib/text-extractor.js')
    vi.mocked(extractText).mockRejectedValueOnce(new Error('Extraction failed'))

    await handler(req as VercelRequest, res as VercelResponse)

    expect(statusMock).toHaveBeenCalledWith(500)
    expect(jsonMock).toHaveBeenCalledWith({
      status: 'error',
      error: expect.stringContaining('Extraction failed'),
    })
  })
})
