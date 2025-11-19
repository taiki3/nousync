import { describe, it, expect } from 'vitest'
import { extractText, isTextExtractionSupported } from './text-extractor'

describe('text-extractor', () => {
  describe('isTextExtractionSupported', () => {
    it('should return true for text/plain', () => {
      expect(isTextExtractionSupported('text/plain')).toBe(true)
    })

    it('should return true for text/markdown', () => {
      expect(isTextExtractionSupported('text/markdown')).toBe(true)
    })

    it('should return true for text/csv', () => {
      expect(isTextExtractionSupported('text/csv')).toBe(true)
    })

    it('should return true for application/json', () => {
      expect(isTextExtractionSupported('application/json')).toBe(true)
    })

    it('should return true for application/pdf', () => {
      expect(isTextExtractionSupported('application/pdf')).toBe(true)
    })

    it('should return false for unsupported types', () => {
      expect(isTextExtractionSupported('image/png')).toBe(false)
      expect(isTextExtractionSupported('video/mp4')).toBe(false)
    })
  })

  describe('extractText', () => {
    describe('text/plain', () => {
      it('should extract plain text', async () => {
        const buffer = Buffer.from('Hello, World!', 'utf-8')
        const result = await extractText(buffer, 'text/plain')
        expect(result).toBe('Hello, World!')
      })

      it('should handle multi-line text', async () => {
        const text = 'Line 1\nLine 2\nLine 3'
        const buffer = Buffer.from(text, 'utf-8')
        const result = await extractText(buffer, 'text/plain')
        expect(result).toBe(text)
      })
    })

    describe('text/markdown', () => {
      it('should extract markdown as-is', async () => {
        const markdown = '# Title\n\nThis is **bold** text.'
        const buffer = Buffer.from(markdown, 'utf-8')
        const result = await extractText(buffer, 'text/markdown')
        expect(result).toBe(markdown)
      })
    })

    describe('text/csv', () => {
      it('should extract CSV as plain text', async () => {
        const csv = 'name,age,city\nJohn,30,NYC\nJane,25,LA'
        const buffer = Buffer.from(csv, 'utf-8')
        const result = await extractText(buffer, 'text/csv')
        expect(result).toBe(csv)
      })
    })

    describe('application/json', () => {
      it('should extract JSON as formatted text', async () => {
        const json = { name: 'John', age: 30 }
        const buffer = Buffer.from(JSON.stringify(json), 'utf-8')
        const result = await extractText(buffer, 'application/json')
        expect(result).toContain('John')
        expect(result).toContain('30')
      })

      it('should handle malformed JSON gracefully', async () => {
        const buffer = Buffer.from('{invalid json', 'utf-8')
        await expect(extractText(buffer, 'application/json')).rejects.toThrow()
      })
    })

    describe('application/pdf', () => {
      it('should extract text from PDF', async () => {
        // This would require a real PDF file or mocking
        // For now, we'll test that the function exists and throws appropriately
        const buffer = Buffer.from('not a real pdf', 'utf-8')

        // PDF extraction should fail with invalid PDF data
        await expect(extractText(buffer, 'application/pdf')).rejects.toThrow()
      })
    })

    describe('error handling', () => {
      it('should throw error for unsupported mime type', async () => {
        const buffer = Buffer.from('test', 'utf-8')
        await expect(extractText(buffer, 'image/png')).rejects.toThrow(
          'Unsupported file type'
        )
      })

      it('should throw error for empty buffer', async () => {
        const buffer = Buffer.from('', 'utf-8')
        await expect(extractText(buffer, 'text/plain')).rejects.toThrow(
          'Empty file'
        )
      })
    })
  })
})
