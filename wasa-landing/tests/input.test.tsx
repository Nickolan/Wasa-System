import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Input } from '@shared/ui/Input'

describe('Input: label asociada al control', () => {
  it('is found by its accessible label, and the label for matches the input id', () => {
    render(<Input label="Email" />)
    const input = screen.getByLabelText('Email')
    const label = screen.getByText('Email')
    expect(label.tagName).toBe('LABEL')
    expect(label).toHaveAttribute('for', input.id)
  })
})

describe('Input: estado de error', () => {
  it('shows the message, marks aria-invalid, describedby, and the error border class', () => {
    render(<Input label="Email" error="Email inválido" />)
    const input = screen.getByLabelText('Email')
    const message = screen.getByText('Email inválido')

    expect(message).toBeVisible()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input.getAttribute('aria-describedby')).toBe(message.id)
    expect(input).toHaveClass('border-red-500')
  })
})

describe('Input: texto de ayuda sin error', () => {
  it('shows the helper, references it, and does not mark aria-invalid', () => {
    render(<Input label="Email" helper="Usá tu email de trabajo" />)
    const input = screen.getByLabelText('Email')
    const helper = screen.getByText('Usá tu email de trabajo')

    expect(helper).toBeVisible()
    expect(input.getAttribute('aria-describedby')).toBe(helper.id)
    expect(input).not.toHaveAttribute('aria-invalid', 'true')
  })
})

describe('Input: el error desplaza al helper', () => {
  it('shows only the error message when both are present', () => {
    render(<Input label="Email" helper="Usá tu email de trabajo" error="Email inválido" />)
    expect(screen.getByText('Email inválido')).toBeInTheDocument()
    expect(screen.queryByText('Usá tu email de trabajo')).not.toBeInTheDocument()
  })
})

describe('Input: estado válido', () => {
  // R-1 (design.md unified-design-system): la clase de borde válido pasa a
  // derivar del token `success` (D-2/D-11.2) — el test afirma que difiere
  // de los otros dos estados, nunca un color concreto.
  it('applies a border class distinct from rest and from error state', () => {
    const { container: restContainer } = render(<Input label="Email en reposo" />)
    const { container: errorContainer } = render(<Input label="Email con error" error="Email inválido" />)
    const { container: validContainer } = render(<Input label="Email válido" valid />)

    const restClass = restContainer.querySelector('input')?.className
    const errorClass = errorContainer.querySelector('input')?.className
    const validClass = validContainer.querySelector('input')?.className

    expect(validClass).not.toBe(restClass)
    expect(validClass).not.toBe(errorClass)
    expect(validClass).not.toContain('border-red-500')
  })
})

describe('Input: en reposo', () => {
  it('has no associated message and is not marked invalid', () => {
    render(<Input label="Email" />)
    const input = screen.getByLabelText('Email')
    expect(input).not.toHaveAttribute('aria-describedby')
    expect(input).not.toHaveAttribute('aria-invalid')
  })
})

describe('Input: dos instancias no colisionan de id', () => {
  it('gives each instance a distinct id, each label pointing to its own', () => {
    render(
      <>
        <Input label="Email" />
        <Input label="Contraseña" />
      </>,
    )
    const email = screen.getByLabelText('Email')
    const password = screen.getByLabelText('Contraseña')
    expect(email.id).not.toBe(password.id)
  })
})

describe('Input: integración con React Hook Form (register())', () => {
  it('forwards name/onChange/onBlur to the DOM input and attaches ref to the real node', () => {
    const onChange = vi.fn()
    const onBlur = vi.fn()
    const ref = createRef<HTMLInputElement>()

    render(
      <Input
        label="Email"
        name="email"
        onChange={onChange}
        onBlur={onBlur}
        ref={ref}
      />,
    )

    const input = screen.getByLabelText('Email') as HTMLInputElement
    expect(input).toHaveAttribute('name', 'email')
    expect(ref.current).toBe(input)
  })
})
