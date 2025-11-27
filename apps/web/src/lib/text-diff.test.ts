import { describe, it, expect } from 'vitest'
import { calculateDelta, TextDelta } from './text-diff'

describe('calculateDelta', () => {
  describe('挿入操作', () => {
    it('should detect insertion at the beginning', () => {
      const delta = calculateDelta('Hello', 'XHello')

      expect(delta).toEqual({
        start: 0,
        delete: 0,
        insert: 'X',
      })
    })

    it('should detect insertion at the end', () => {
      const delta = calculateDelta('Hello', 'HelloX')

      expect(delta).toEqual({
        start: 5,
        delete: 0,
        insert: 'X',
      })
    })

    it('should detect insertion in the middle', () => {
      const delta = calculateDelta('Hello', 'HelXlo')

      expect(delta).toEqual({
        start: 3,
        delete: 0,
        insert: 'X',
      })
    })

    it('should detect multi-character insertion', () => {
      const delta = calculateDelta('Hello', 'Hello World')

      expect(delta).toEqual({
        start: 5,
        delete: 0,
        insert: ' World',
      })
    })

    it('should handle insertion into empty string', () => {
      const delta = calculateDelta('', 'Hello')

      expect(delta).toEqual({
        start: 0,
        delete: 0,
        insert: 'Hello',
      })
    })
  })

  describe('削除操作', () => {
    it('should detect deletion at the beginning', () => {
      const delta = calculateDelta('Hello', 'ello')

      expect(delta).toEqual({
        start: 0,
        delete: 1,
        insert: '',
      })
    })

    it('should detect deletion at the end', () => {
      const delta = calculateDelta('Hello', 'Hell')

      expect(delta).toEqual({
        start: 4,
        delete: 1,
        insert: '',
      })
    })

    it('should detect deletion in the middle', () => {
      const delta = calculateDelta('Hello', 'Helo')

      // 後方一致により、末尾の "lo" が一致するため start は 3
      // "Hel|l|o" -> "Hel|o" (位置3で1文字削除)
      expect(delta).toEqual({
        start: 3,
        delete: 1,
        insert: '',
      })
    })

    it('should detect multi-character deletion', () => {
      const delta = calculateDelta('Hello World', 'Hello')

      expect(delta).toEqual({
        start: 5,
        delete: 6,
        insert: '',
      })
    })

    it('should handle deletion to empty string', () => {
      const delta = calculateDelta('Hello', '')

      expect(delta).toEqual({
        start: 0,
        delete: 5,
        insert: '',
      })
    })
  })

  describe('置換操作', () => {
    it('should detect single character replacement', () => {
      const delta = calculateDelta('Hello', 'Hallo')

      expect(delta).toEqual({
        start: 1,
        delete: 1,
        insert: 'a',
      })
    })

    it('should detect multi-character replacement', () => {
      const delta = calculateDelta('Hello World', 'Hello Universe')

      expect(delta).toEqual({
        start: 6,
        delete: 5,
        insert: 'Universe',
      })
    })

    it('should detect replacement at the beginning', () => {
      const delta = calculateDelta('Hello', 'Jello')

      expect(delta).toEqual({
        start: 0,
        delete: 1,
        insert: 'J',
      })
    })

    it('should detect complete replacement', () => {
      const delta = calculateDelta('Hello', 'World')

      expect(delta).toEqual({
        start: 0,
        delete: 5,
        insert: 'World',
      })
    })
  })

  describe('変更なし', () => {
    it('should return no-op for identical strings', () => {
      const delta = calculateDelta('Hello', 'Hello')

      expect(delta).toEqual({
        start: 5,
        delete: 0,
        insert: '',
      })
    })

    it('should handle empty strings', () => {
      const delta = calculateDelta('', '')

      expect(delta).toEqual({
        start: 0,
        delete: 0,
        insert: '',
      })
    })
  })

  describe('日本語テキスト', () => {
    it('should handle Japanese character insertion', () => {
      const delta = calculateDelta('こんにちは', 'こんにちは世界')

      expect(delta).toEqual({
        start: 5,
        delete: 0,
        insert: '世界',
      })
    })

    it('should handle Japanese character deletion', () => {
      const delta = calculateDelta('こんにちは世界', 'こんにちは')

      expect(delta).toEqual({
        start: 5,
        delete: 2,
        insert: '',
      })
    })

    it('should handle Japanese character replacement', () => {
      const delta = calculateDelta('こんにちは', 'こんばんは')

      expect(delta).toEqual({
        start: 2,
        delete: 2,
        insert: 'ばん',
      })
    })
  })

  describe('マルチバイト/Unicode', () => {
    it('should handle emoji insertion', () => {
      const delta = calculateDelta('Hello', 'Hello 👋')

      expect(delta).toEqual({
        start: 5,
        delete: 0,
        insert: ' 👋',
      })
    })

    it('should handle emoji deletion', () => {
      const delta = calculateDelta('Hello 👋 World', 'Hello  World')

      expect(delta).toEqual({
        start: 6,
        delete: 2,
        insert: '',
      })
    })
  })

  describe('改行を含むテキスト', () => {
    it('should handle newline insertion', () => {
      const delta = calculateDelta('Hello World', 'Hello\nWorld')

      expect(delta).toEqual({
        start: 5,
        delete: 1,
        insert: '\n',
      })
    })

    it('should handle multi-line text changes', () => {
      const oldText = 'Line 1\nLine 2\nLine 3'
      const newText = 'Line 1\nModified Line\nLine 3'

      const delta = calculateDelta(oldText, newText)

      expect(delta).toEqual({
        start: 7,
        delete: 6,
        insert: 'Modified Line',
      })
    })

    it('should handle adding new line at end', () => {
      const delta = calculateDelta('Line 1\nLine 2', 'Line 1\nLine 2\nLine 3')

      expect(delta).toEqual({
        start: 13,
        delete: 0,
        insert: '\nLine 3',
      })
    })
  })

  describe('エッジケース', () => {
    it('should handle repeated characters correctly', () => {
      const delta = calculateDelta('aaa', 'aaaa')

      expect(delta).toEqual({
        start: 3,
        delete: 0,
        insert: 'a',
      })
    })

    it('should handle deletion of repeated characters', () => {
      const delta = calculateDelta('aaaa', 'aaa')

      expect(delta).toEqual({
        start: 3,
        delete: 1,
        insert: '',
      })
    })

    it('should handle space-only changes', () => {
      const delta = calculateDelta('Hello World', 'Hello  World')

      expect(delta).toEqual({
        start: 6,
        delete: 0,
        insert: ' ',
      })
    })

    it('should handle tab characters', () => {
      const delta = calculateDelta('Hello\tWorld', 'Hello World')

      expect(delta).toEqual({
        start: 5,
        delete: 1,
        insert: ' ',
      })
    })
  })

  describe('Y.js との統合確認', () => {
    /**
     * calculateDelta の結果を Y.Text に適用した場合に
     * 期待通りの結果になることを確認するヘルパーテスト
     */
    it('should produce correct delta for Y.Text operations', () => {
      const testCases = [
        { old: 'Hello', new: 'Hello World' },
        { old: 'Hello World', new: 'Hello' },
        { old: 'Hello', new: 'Hallo' },
        { old: '', new: 'New content' },
        { old: 'Delete me', new: '' },
        { old: 'こんにちは', new: 'こんばんは' },
      ]

      for (const { old, new: newText } of testCases) {
        const delta = calculateDelta(old, newText)

        // delta を適用してシミュレート
        let result = old
        if (delta.delete > 0) {
          result = result.slice(0, delta.start) + result.slice(delta.start + delta.delete)
        }
        if (delta.insert) {
          result = result.slice(0, delta.start) + delta.insert + result.slice(delta.start)
        }

        expect(result).toBe(newText)
      }
    })
  })
})
