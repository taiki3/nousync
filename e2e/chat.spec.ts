import { test, expect } from '@playwright/test'

test.describe('Chat API', () => {
  test('GET /api/chat/models returns available models', async ({ page }) => {
    // Navigate to page first so we can use fetch
    await page.goto('/')
    // Use page.evaluate to make fetch request through the browser
    const data = await page.evaluate(async () => {
      const response = await fetch('/api/chat/models')
      return response.json()
    })
    expect(data.status).toBe('success')
    expect(Array.isArray(data.data.models)).toBeTruthy()
    expect(data.data.models.length).toBeGreaterThan(0)

    // Check model structure
    const model = data.data.models[0]
    expect(model).toHaveProperty('provider')
    expect(model).toHaveProperty('modelId')
    expect(model).toHaveProperty('displayName')
  })

  test('Models include expected providers', async ({ page }) => {
    // Navigate to page first so we can use fetch
    await page.goto('/')
    // Use page.evaluate to make fetch request through the browser
    const data = await page.evaluate(async () => {
      const response = await fetch('/api/chat/models')
      return response.json()
    })

    const providers = [...new Set(data.data.models.map((m: { provider: string }) => m.provider))]

    // At least one provider should be available
    expect(providers.length).toBeGreaterThan(0)

    // Log available providers for debugging
    console.log('Available providers:', providers)
  })
})
