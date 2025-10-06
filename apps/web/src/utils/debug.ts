// デバッグ用のログ関数
// 本番環境では自動的に無効化され、Lintエラーも回避できる

const isDevelopment = import.meta.env.DEV

export const debugLog = (...args: unknown[]) => {
  if (isDevelopment) {
    // biome-ignore lint/suspicious/noConsole: デバッグ用
    console.log(...args)
  }
}

export const debugError = (...args: unknown[]) => {
  if (isDevelopment) {
    // biome-ignore lint/suspicious/noConsole: デバッグ用
    console.error(...args)
  }
}

export const debugWarn = (...args: unknown[]) => {
  if (isDevelopment) {
    // biome-ignore lint/suspicious/noConsole: デバッグ用
    console.warn(...args)
  }
}
