import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Checkbox } from '@shared/ui/Checkbox'

describe('Checkbox: clic sobre el texto alterna el control', () => {
  it('checks the box when the user clicks on its label text', async () => {
    const user = userEvent.setup()
    render(<Checkbox label="Acepto los términos" />)
    const checkbox = screen.getByLabelText('Acepto los términos')
    expect(checkbox).not.toBeChecked()

    await user.click(screen.getByText('Acepto los términos'))
    expect(checkbox).toBeChecked()
  })
})

describe('Checkbox: con error', () => {
  it('shows the message and marks aria-invalid/aria-describedby', () => {
    render(<Checkbox label="Acepto los términos" error="Debés aceptar para continuar" />)
    const checkbox = screen.getByLabelText('Acepto los términos')
    const message = screen.getByText('Debés aceptar para continuar')

    expect(message).toBeVisible()
    expect(checkbox).toHaveAttribute('aria-invalid', 'true')
    expect(checkbox.getAttribute('aria-describedby')).toBe(message.id)
  })
})

describe('Checkbox: estado controlado por el consumidor', () => {
  it('invokes onChange once and does not alter state on its own', async () => {
    const user = userEvent.setup()
    const fn = vi.fn()
    render(<Checkbox label="Acepto" checked={false} onChange={fn} />)
    const checkbox = screen.getByLabelText('Acepto')

    await user.click(checkbox)
    expect(fn).toHaveBeenCalledTimes(1)
    // The consumer controls `checked`; since it stayed `false`, the DOM
    // reflects that even after the click (uncontrolled toggling is absent).
    expect(checkbox).not.toBeChecked()
  })
})
