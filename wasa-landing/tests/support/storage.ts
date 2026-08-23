import { vi } from 'vitest'

type StorageMethod = 'getItem' | 'setItem' | 'removeItem'

/**
 * Runs `run()` while `localStorage.<method>` throws on every call, then
 * restores the real implementation — even if `run()` itself throws. Used to
 * exercise the hostile-storage paths of D-4 (a `localStorage` that rejects
 * operations must degrade persistence, not the app).
 */
export function withThrowingStorage(method: StorageMethod, run: () => void): void {
  const spy = vi.spyOn(Storage.prototype, method).mockImplementation(() => {
    throw new Error(`simulated localStorage.${method} failure`)
  })
  try {
    run()
  } finally {
    spy.mockRestore()
  }
}
