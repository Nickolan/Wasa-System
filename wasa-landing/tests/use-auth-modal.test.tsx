import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useAuthModal } from '@widgets/auth-modal'

describe('useAuthModal — arranca sin ningún modal abierto', () => {
  it('mode es null al montar', () => {
    const { result } = renderHook(() => useAuthModal())
    expect(result.current.mode).toBeNull()
  })
})

describe('useAuthModal — cada apertura fija su modo (2.3)', () => {
  it('openLogin() deja mode === "login", partiendo de null', () => {
    const { result } = renderHook(() => useAuthModal())
    expect(result.current.mode).toBeNull()

    act(() => result.current.openLogin())

    expect(result.current.mode).toBe('login')
  })

  it('openRegister() deja mode === "register", partiendo de null', () => {
    const { result } = renderHook(() => useAuthModal())
    expect(result.current.mode).toBeNull()

    act(() => result.current.openRegister())

    expect(result.current.mode).toBe('register')
  })
})

describe('useAuthModal — alternar no acumula (2.4)', () => {
  it('openLogin() seguido de openRegister() deja mode === "register"', () => {
    const { result } = renderHook(() => useAuthModal())

    act(() => result.current.openLogin())
    act(() => result.current.openRegister())

    expect(result.current.mode).toBe('register')
  })

  it('openRegister() seguido de openLogin() deja mode === "login"', () => {
    const { result } = renderHook(() => useAuthModal())

    act(() => result.current.openRegister())
    act(() => result.current.openLogin())

    expect(result.current.mode).toBe('login')
  })
})

describe('useAuthModal — cerrar vuelve a ninguno, nunca al otro (2.5)', () => {
  it('close() desde "login" deja mode === null', () => {
    const { result } = renderHook(() => useAuthModal())
    act(() => result.current.openLogin())

    act(() => result.current.close())

    expect(result.current.mode).toBeNull()
  })

  it('close() desde "register" deja mode === null', () => {
    const { result } = renderHook(() => useAuthModal())
    act(() => result.current.openRegister())

    act(() => result.current.close())

    expect(result.current.mode).toBeNull()
  })

  it('close() sobre null es idempotente y no lanza', () => {
    const { result } = renderHook(() => useAuthModal())

    expect(() => act(() => result.current.close())).not.toThrow()
    expect(result.current.mode).toBeNull()
  })
})
