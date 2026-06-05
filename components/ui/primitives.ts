import * as React from 'react'
import {
  Button as HeadlessButton,
  Input as HeadlessInput,
  Textarea as HeadlessTextarea,
} from '@headlessui/react'

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

type UiButtonTone = 'quiet' | 'soft' | 'solid' | 'danger'
type UiButtonSize = 'sm' | 'md' | 'lg'

const uiButtonBase =
  'inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap transition-[background-color,border-color,color,opacity,transform] duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-40'

const uiButtonToneClass: Record<UiButtonTone, string> = {
  quiet:
    'rounded-xl border border-transparent bg-transparent text-[var(--ui-muted)] hover:bg-[color-mix(in_srgb,var(--ui-line)_42%,transparent)] hover:text-[var(--ui-ink)]',
  soft:
    'rounded-xl border border-transparent bg-[color-mix(in_srgb,var(--ui-line)_50%,transparent)] text-[var(--ui-ink)] hover:bg-[color-mix(in_srgb,var(--ui-line)_70%,transparent)]',
  solid:
    'rounded-xl border border-transparent bg-[var(--ui-accent)] text-[var(--ui-accent-ink)] hover:brightness-[1.03]',
  danger:
    'rounded-xl border border-transparent bg-transparent text-[var(--ui-muted)] hover:bg-[color-mix(in_srgb,var(--ui-danger)_8%,transparent)] hover:text-[var(--ui-danger)]',
}

const uiButtonSizeClass: Record<UiButtonSize, string> = {
  sm: 'h-8 px-2.5 text-[13px] font-medium',
  md: 'h-9 px-3 text-[13px] font-medium',
  lg: 'h-10 px-4 text-[14px] font-medium',
}

export interface UiButtonProps extends Omit<React.ComponentPropsWithoutRef<'button'>, 'color'> {
  tone?: UiButtonTone
  size?: UiButtonSize
  fullWidth?: boolean
}

export const UiButton = React.forwardRef<HTMLButtonElement, UiButtonProps>(function UiButton(
  {
    className,
    tone = 'quiet',
    size = 'md',
    fullWidth = false,
    type = 'button',
    ...props
  },
  ref,
) {
  return React.createElement(HeadlessButton, {
    ref,
    type,
    className: cx(
      uiButtonBase,
      uiButtonToneClass[tone],
      uiButtonSizeClass[size],
      fullWidth && 'w-full',
      className,
    ),
    ...props,
  })
})

export interface UiIconButtonProps extends UiButtonProps {
  'aria-label'?: string
}

export const UiIconButton = React.forwardRef<HTMLButtonElement, UiIconButtonProps>(function UiIconButton(
  {
    className,
    tone = 'quiet',
    size = 'md',
    ...props
  },
  ref,
) {
  const sizeClass = size === 'lg' ? 'h-10 w-10' : size === 'sm' ? 'h-8 w-8' : 'h-9 w-9'

  return React.createElement(UiButton, {
    ref,
    tone,
    size,
    className: cx('rounded-full px-0', sizeClass, className),
    ...props,
  })
})

type UiFieldVariant = 'ghost' | 'composer' | 'title'

const uiFieldBase =
  'w-full appearance-none border-0 bg-transparent text-[var(--ui-ink)] shadow-none outline-none transition-[color,opacity] duration-150 placeholder:text-[color-mix(in_srgb,var(--ui-muted)_74%,transparent)] focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0'

const uiFieldVariantClass: Record<UiFieldVariant, string> = {
  ghost: 'rounded-none px-0 py-1 text-[15px] leading-7',
  composer: 'rounded-none px-0 py-0.5 text-[15px] leading-7',
  title: 'rounded-none px-0 py-0 text-4xl font-bold leading-tight tracking-tight',
}

export interface UiInputProps extends React.ComponentPropsWithoutRef<'input'> {
  variant?: UiFieldVariant
}

export const UiInput = React.forwardRef<HTMLInputElement, UiInputProps>(function UiInput(
  { className, variant = 'ghost', ...props },
  ref,
) {
  return React.createElement(HeadlessInput, {
    ref,
    className: cx(uiFieldBase, uiFieldVariantClass[variant], className),
    ...props,
  })
})

export interface UiTextareaProps extends React.ComponentPropsWithoutRef<'textarea'> {
  variant?: UiFieldVariant
}

export const UiTextarea = React.forwardRef<HTMLTextAreaElement, UiTextareaProps>(function UiTextarea(
  { className, variant = 'ghost', ...props },
  ref,
) {
  return React.createElement(HeadlessTextarea, {
    ref,
    className: cx(uiFieldBase, 'resize-none', uiFieldVariantClass[variant], className),
    ...props,
  })
})

export interface UiPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  inset?: 'none' | 'soft'
}

export function UiPanel({ className, inset = 'none', ...props }: UiPanelProps) {
  return React.createElement('div', {
    className: cx(
      'rounded-[1.5rem] border border-[color-mix(in_srgb,var(--ui-line)_84%,transparent)] bg-[color-mix(in_srgb,var(--ui-bg)_92%,var(--ui-panel))]',
      inset === 'soft' && 'bg-[color-mix(in_srgb,var(--ui-bg)_76%,var(--ui-soft))]',
      className,
    ),
    ...props,
  })
}
