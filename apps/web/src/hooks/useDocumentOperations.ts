import type { Document } from '@nousync/shared'
import { useCallback, useState } from 'react'
import { documentsApi } from '../services/api'
import { useApiCall } from './useApiCall'

export function useDocumentOperations() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)
  const { execute: executeApi } = useApiCall()

  const createDocument = useCallback(
    async (data: Partial<Document>) => {
      // Ensure required fields are present for create
      if (!data.title || !data.content) {
        throw new Error('Title and content are required for creating a document')
      }

      const createParams = {
        title: data.title,
        content: data.content,
        summary: data.summary || '',
        tags: data.tags || [],
      }

      const newDoc = await executeApi(() => documentsApi.create(createParams))
      if (newDoc) {
        setDocuments((prev) => [...prev, newDoc as Document])
        setSelectedDocument(newDoc as Document)
      }
      return newDoc
    },
    [executeApi],
  )

  const updateDocument = useCallback(
    async (id: string, updates: Partial<Document>) => {
      // Optimistic update
      setDocuments((prev) => prev.map((doc) => (doc.id === id ? { ...doc, ...updates } : doc)))

      setSelectedDocument((prev) => (prev?.id === id ? { ...prev, ...updates } : prev))

      // Server update
      const updatedDoc = await executeApi(() => documentsApi.update(id, updates))

      if (updatedDoc) {
        // Sync with server response
        setDocuments((prev) => prev.map((doc) => (doc.id === id ? (updatedDoc as Document) : doc)))

        setSelectedDocument((prev) => (prev?.id === id ? (updatedDoc as Document) : prev))
      }

      return updatedDoc
    },
    [executeApi],
  )

  const deleteDocument = useCallback(
    async (id: string) => {
      const success = await executeApi(() => documentsApi.delete(id))

      if (success !== null) {
        setDocuments((prev) => prev.filter((doc) => doc.id !== id))

        setSelectedDocument((prev) => (prev?.id === id ? null : prev))
      }
    },
    [executeApi],
  )

  const loadDocuments = useCallback(async () => {
    const docs = await executeApi(() => documentsApi.getAll())
    if (docs) {
      setDocuments(docs as Document[])
    }
    return docs
  }, [executeApi])

  return {
    documents,
    selectedDocument,
    setDocuments,
    setSelectedDocument,
    createDocument,
    updateDocument,
    deleteDocument,
    loadDocuments,
  }
}
