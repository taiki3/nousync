import { useCallback, useState } from 'react'

export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
  options?: {
    serialize?: (value: T) => string
    deserialize?: (value: string) => T
  },
) {
  const serialize = options?.serialize || JSON.stringify
  const deserialize = options?.deserialize || JSON.parse

  const [value, setValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key)
      return item ? deserialize(item) : defaultValue
    } catch (_error) {
      return defaultValue
    }
  })

  const setStoredValue = useCallback(
    (newValue: T | ((prev: T) => T)) => {
      try {
        setValue((prevValue) => {
          const valueToStore = newValue instanceof Function ? newValue(prevValue) : newValue
          window.localStorage.setItem(key, serialize(valueToStore))
          return valueToStore
        })
      } catch (_error) {}
    },
    [key, serialize],
  )

  const removeValue = useCallback(() => {
    try {
      window.localStorage.removeItem(key)
      setValue(defaultValue)
    } catch (_error) {}
  }, [key, defaultValue])

  return [value, setStoredValue, removeValue] as const
}
