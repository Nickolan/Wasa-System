import { render } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '@entities/user'

const initialState = useAuthStore.getState()

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState(initialState, true)
})

function IsAuthenticatedProbe({ onRender }: { onRender: () => void }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  onRender()
  return <span>{String(isAuthenticated)}</span>
}

describe('useAuthStore: consumo por selector (D-9)', () => {
  it('a component selecting isAuthenticated does not re-render when only email changes', () => {
    let renderCount = 0
    render(<IsAuthenticatedProbe onRender={() => renderCount++} />)
    expect(renderCount).toBe(1)

    act(() => {
      useAuthStore.setState({ email: 'someone-else@example.com' })
    })

    expect(renderCount).toBe(1)
  })

  it('the token is readable outside React via useAuthStore.getState().token after login', () => {
    useAuthStore.getState().login('token-abc', 'alice@example.com')

    expect(useAuthStore.getState().token).toBe('token-abc')
  })

  it('login/logout/hydrate references stay stable across a state transition', () => {
    const before = useAuthStore.getState()

    useAuthStore.getState().login('token-abc', 'alice@example.com')

    const after = useAuthStore.getState()
    expect(after.login).toBe(before.login)
    expect(after.logout).toBe(before.logout)
    expect(after.hydrate).toBe(before.hydrate)
  })
})
