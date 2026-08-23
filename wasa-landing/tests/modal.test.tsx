import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from '@shared/ui/Modal'

describe('Modal: abierto renderiza backdrop y diálogo', () => {
  it('renders a role="dialog" aria-modal element containing the content, plus the backdrop', () => {
    render(
      <Modal isOpen onClose={vi.fn()}>
        contenido
      </Modal>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveTextContent('contenido')
    expect(screen.getByTestId('modal-backdrop')).toBeInTheDocument()
  })
})

describe('Modal: cerrado no renderiza nada', () => {
  it('renders neither the content nor the backdrop', () => {
    render(
      <Modal isOpen={false} onClose={vi.fn()}>
        contenido
      </Modal>,
    )
    expect(screen.queryByText('contenido')).not.toBeInTheDocument()
    expect(screen.queryByTestId('modal-backdrop')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('Modal: cierre con Escape', () => {
  it('invokes onClose exactly once when open and Escape is pressed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Modal isOpen onClose={onClose}>
        contenido
      </Modal>,
    )
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not invoke onClose when closed and Escape is pressed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Modal isOpen={false} onClose={onClose}>
        contenido
      </Modal>,
    )
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('removes the listener on close: Escape after closing/unmounting does not invoke onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { rerender, unmount } = render(
      <Modal isOpen onClose={onClose}>
        contenido
      </Modal>,
    )

    rerender(
      <Modal isOpen={false} onClose={onClose}>
        contenido
      </Modal>,
    )
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()

    unmount()
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('Modal: backdrop', () => {
  it('invokes onClose once when the user clicks the backdrop', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Modal isOpen onClose={onClose}>
        contenido
      </Modal>,
    )
    await user.click(screen.getByTestId('modal-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not invoke onClose when the user clicks an element inside children', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Modal isOpen onClose={onClose}>
        <button type="button">dentro</button>
      </Modal>,
    )
    await user.click(screen.getByText('dentro'))
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('Modal: título y scroll', () => {
  it('takes its accessible name from title via aria-labelledby', () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Iniciar sesión">
        contenido
      </Modal>,
    )
    expect(screen.getByText('Iniciar sesión')).toBeVisible()
    expect(screen.getByRole('dialog', { name: 'Iniciar sesión' })).toBeInTheDocument()
  })

  it('blocks body scroll while open and restores the previous overflow value on close', () => {
    document.body.style.overflow = 'auto'
    const { rerender, unmount } = render(
      <Modal isOpen onClose={vi.fn()}>
        contenido
      </Modal>,
    )
    expect(document.body.style.overflow).toBe('hidden')

    rerender(
      <Modal isOpen={false} onClose={vi.fn()}>
        contenido
      </Modal>,
    )
    expect(document.body.style.overflow).toBe('auto')

    unmount()
    document.body.style.overflow = ''
  })
})
