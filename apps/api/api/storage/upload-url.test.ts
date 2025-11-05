import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import handler from './upload-url'

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
        createSignedUploadUrl: vi.fn(async (path: string) => ({
          data: {
            signedUrl: `https://supabase.example.com/storage/v1/upload/sign/documents/${path}`,
            path,
            token: 'mock-token-' + Math.random().toString(36).substring(2),
          },
          error: null,
        })),
      })),
    },
  })),
  isAllowedFileType: vi.fn((mimeType: string) => {
    const allowed = [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'text/csv',
      'application/json',
    ]
    return allowed.includes(mimeType)
  }),
  generateStoragePath: vi.fn((userId: string, fileName: string) => {
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(2, 8)
    return `${userId}/${timestamp}-${randomStr}-${fileName}`
  }),
  BUCKET_NAME: 'documents',
}))

describe('/api/storage/upload-url', () => {
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
        fileName: 'test-document.pdf',
        fileType: 'application/pdf',
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

  it('should return 400 when fileName is missing', async () => {
    req.body = { fileType: 'application/pdf' }

    await handler(req as VercelRequest, res as VercelResponse)

    expect(statusMock).toHaveBeenCalledWith(400)
    expect(jsonMock).toHaveBeenCalledWith({
      status: 'error',
      error: expect.stringContaining('fileName'),
    })
  })

  it('should return 400 when fileType is missing', async () => {
    req.body = { fileName: 'test.pdf' }

    await handler(req as VercelRequest, res as VercelResponse)

    expect(statusMock).toHaveBeenCalledWith(400)
    expect(jsonMock).toHaveBeenCalledWith({
      status: 'error',
      error: expect.stringContaining('fileType'),
    })
  })

  it('should generate signed upload URL for authenticated user', async () => {
    await handler(req as VercelRequest, res as VercelResponse)

    expect(statusMock).toHaveBeenCalledWith(200)
    expect(jsonMock).toHaveBeenCalledWith({
      status: 'success',
      data: {
        uploadUrl: expect.stringContaining('https://'),
        path: expect.stringContaining('test-document.pdf'),
        token: expect.any(String),
      },
    })
  })

  it('should generate unique paths for same filename', async () => {
    const firstCall = vi.fn()
    const secondCall = vi.fn()

    res.status = vi.fn(() => ({ json: firstCall }))
    await handler(req as VercelRequest, res as VercelResponse)

    res.status = vi.fn(() => ({ json: secondCall }))
    await handler(req as VercelRequest, res as VercelResponse)

    const firstPath = firstCall.mock.calls[0][0].data.path
    const secondPath = secondCall.mock.calls[0][0].data.path

    expect(firstPath).not.toBe(secondPath)
  })

  it('should only allow specific file types', async () => {
    req.body = {
      fileName: 'malicious.exe',
      fileType: 'application/x-msdownload',
    }

    await handler(req as VercelRequest, res as VercelResponse)

    expect(statusMock).toHaveBeenCalledWith(400)
    expect(jsonMock).toHaveBeenCalledWith({
      status: 'error',
      error: expect.stringContaining('file type not allowed'),
    })
  })
})
