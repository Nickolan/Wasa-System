import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from '@app/App'

describe('App renders the Landing placeholder', () => {
  it('shows the WASA landing placeholder heading', () => {
    render(<App />)
    expect(screen.getByText(/WASA/i)).toBeInTheDocument()
  })
})
