import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import CollaborativeTextEditor from './CollaborativeTextEditor'
import type { Document } from '@nousync/shared'

// SupabaseProviderのモック
vi.mock('../lib/yjs-supabase-provider', () => {
  return {
    SupabaseProvider: class MockSupabaseProvider {
      doc: any
      persistence = {
        whenSynced: Promise.resolve(),
      }
      disconnect = vi.fn()
      isSynced = vi.fn(() => true)

      constructor(documentId: string, doc: any, supabase: any) {
        this.doc = doc
      }
    },
  }
})

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    supabase: {
      channel: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn(),
        send: vi.fn(),
      })),
      removeChannel: vi.fn(),
    },
  }),
}))

describe('CollaborativeTextEditor - Basic Functionality', () => {
  let mockDocument: Document
  let mockOnUpdate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockDocument = {
      id: 'doc-1',
      user_id: 'user-1',
      title: 'Test Doc',
      content: '# Test Doc\n\nInitial content',
      tags: ['tag1'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    mockOnUpdate = vi.fn()
  })

  it('should render without document', () => {
    render(
      <CollaborativeTextEditor
        document={null}
        onDocumentUpdate={mockOnUpdate}
      />
    )

    expect(screen.getByText('ドキュメントを選択してください')).toBeTruthy()
  })

  it('should render with document', async () => {
    render(
      <CollaborativeTextEditor
        document={mockDocument}
        onDocumentUpdate={mockOnUpdate}
      />
    )

    // ドキュメントタイトルが表示される
    expect(screen.getByText('Test Doc')).toBeTruthy()

    // タグが表示される
    expect(screen.getByText('tag1')).toBeTruthy()
  })

  it('should render textarea in edit mode', async () => {
    const { container } = render(
      <CollaborativeTextEditor
        document={mockDocument}
        onDocumentUpdate={mockOnUpdate}
      />
    )

    const textarea = container.querySelector('textarea')
    expect(textarea).toBeTruthy()
  })
})
