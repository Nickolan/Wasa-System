import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '@shared/ui/Button'

describe('Button: estado de carga', () => {
  it('renders a Spinner, is disabled, and has aria-busy="true"', () => {
    const { container } = render(<Button loading>Ingresar</Button>)
    const button = screen.getByRole('button', { name: 'Ingresar' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelector('svg.animate-spin')).not.toBeNull()
  })
})

describe('Button: interacción', () => {
  it('does not invoke onClick when loading and clicked', async () => {
    const user = userEvent.setup()
    const fn = vi.fn()
    render(
      <Button loading onClick={fn}>
        Ingresar
      </Button>,
    )
    await user.click(screen.getByRole('button', { name: 'Ingresar' }))
    expect(fn).not.toHaveBeenCalled()
  })

  it('renders no Spinner, is not disabled, and invokes onClick once at rest', async () => {
    const user = userEvent.setup()
    const fn = vi.fn()
    const { container } = render(<Button onClick={fn}>Ingresar</Button>)
    const button = screen.getByRole('button', { name: 'Ingresar' })
    expect(button).not.toBeDisabled()
    expect(container.querySelector('svg')).toBeNull()

    await user.click(button)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('respects an explicit disabled without loading', async () => {
    const user = userEvent.setup()
    const fn = vi.fn()
    render(
      <Button disabled onClick={fn}>
        Ingresar
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Ingresar' })
    expect(button).toBeDisabled()

    await user.click(button)
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('Button: variantes y props nativas', () => {
  it('produces a different class for primary vs secondary, and primary is the default', () => {
    const { container: primary } = render(<Button variant="primary">A</Button>)
    const { container: secondary } = render(<Button variant="secondary">A</Button>)
    const { container: omitted } = render(<Button>A</Button>)

    const primaryClass = primary.querySelector('button')?.getAttribute('class')
    const secondaryClass = secondary.querySelector('button')?.getAttribute('class')
    const omittedClass = omitted.querySelector('button')?.getAttribute('class')

    expect(primaryClass).not.toBe(secondaryClass)
    expect(omittedClass).toBe(primaryClass)
  })

  it('propagates native attributes to the underlying <button>', () => {
    render(
      <Button type="submit" data-testid="x">
        A
      </Button>,
    )
    const button = screen.getByTestId('x')
    expect(button.tagName).toBe('BUTTON')
    expect(button).toHaveAttribute('type', 'submit')
  })
})
