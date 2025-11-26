import { test, expect } from '@playwright/test'

test.describe('Health Check', () => {
  test('API health endpoint returns OK', async ({ page }) => {
    // Navigate to page first so we can use fetch
    await page.goto('/')
    // Use page.evaluate to make fetch request through the browser
    const data = await page.evaluate(async () => {
      const response = await fetch('/api/health')
      return response.json()
    })
    expect(data.ok).toBe(true)
  })

  test('Homepage loads successfully', async ({ page }) => {
    await page.goto('/')
    // Wait for the page to be fully loaded
    await page.waitForLoadState('networkidle')
    // Check that the page title or main content exists
    await expect(page).toHaveTitle(/nousync/i)
  })
})
