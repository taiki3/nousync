import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('Unauthenticated requests to protected endpoints return 401', async ({ page }) => {
    // Navigate to page first so we can use fetch
    await page.goto('/')
    // Use page.evaluate to make fetch request through the browser
    const result = await page.evaluate(async () => {
      const response = await fetch('/api/documents')
      const data = await response.json()
      return { status: response.status, data }
    })
    expect(result.status).toBe(401)
    expect(result.data.status).toBe('error')
  })

  test('Login page is accessible', async ({ page }) => {
    await page.goto('/')

    // Wait for React app to load and render
    await page.waitForLoadState('networkidle')

    // Should show login UI with Japanese "ログイン" button
    const loginButton = page.locator('button:has-text("ログイン")')
    await expect(loginButton).toBeVisible({ timeout: 15000 })
  })
})
