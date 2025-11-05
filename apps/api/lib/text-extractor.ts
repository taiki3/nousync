// @ts-ignore - pdf-parse has CJS default export issues
import pdfParse from 'pdf-parse'

const SUPPORTED_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/pdf',
]

export function isTextExtractionSupported(mimeType: string): boolean {
  return SUPPORTED_MIME_TYPES.includes(mimeType)
}

export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (buffer.length === 0) {
    throw new Error('Empty file')
  }

  if (!isTextExtractionSupported(mimeType)) {
    throw new Error(`Unsupported file type: ${mimeType}`)
  }

  switch (mimeType) {
    case 'text/plain':
    case 'text/markdown':
    case 'text/csv':
      return buffer.toString('utf-8')

    case 'application/json':
      try {
        const jsonData = JSON.parse(buffer.toString('utf-8'))
        return JSON.stringify(jsonData, null, 2)
      } catch (err) {
        throw new Error('Invalid JSON file')
      }

    case 'application/pdf':
      try {
        const pdfData = await pdfParse(buffer)
        return pdfData.text
      } catch (err: any) {
        throw new Error(`Failed to extract text from PDF: ${err.message}`)
      }

    default:
      throw new Error(`Unsupported file type: ${mimeType}`)
  }
}

export async function extractTextFromUrl(url: string, mimeType: string): Promise<string> {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Failed to fetch file from URL: ${response.statusText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  return extractText(buffer, mimeType)
}
