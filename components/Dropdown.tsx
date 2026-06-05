'use client'

import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react'
import { Check, ChevronDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cx } from '@/components/ui/primitives'

interface DropdownOption {
  value: string
  label: string
  title?: string
  searchText?: string
}

interface DropdownProps {
  options: DropdownOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  menuPlacement?: 'top' | 'bottom'
}

export function Dropdown({
  options,
  value,
  onChange,
  placeholder = '请选择',
  className = '',
  disabled = false,
  menuPlacement = 'bottom',
}: DropdownProps) {
  const [query, setQuery] = useState('')

  const selectedOption = options.find((option) => option.value === value) || null

  const filteredOptions = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return options
    return options.filter((option) => (
      `${option.label} ${option.searchText || ''}`.toLowerCase().includes(keyword)
    ))
  }, [options, query])

  const searchEnabled = options.length > 5

  return (
    <Combobox
      value={value}
      onChange={(nextValue: string | null) => {
        if (typeof nextValue === 'string') onChange(nextValue)
      }}
      disabled={disabled}
      nullable
    >
      <div className={cx('relative', className)}>
        <div className={cx(
          'ui-control rounded-lg px-3',
          disabled && 'ui-control-disabled',
        )}>
          <div className="flex min-h-[2.25rem] items-center gap-2">
            <ComboboxInput
              aria-label={placeholder}
              displayValue={() => selectedOption?.label || ''}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={selectedOption ? undefined : placeholder}
              title={selectedOption?.title}
              className="h-full flex-1 border-0 bg-transparent p-0 text-sm text-[var(--ui-ink)] outline-none placeholder:text-[var(--ui-muted)]"
            />
            <ComboboxButton className="flex h-8 w-5 cursor-pointer items-center justify-center text-[var(--ui-muted)]">
              <ChevronDown className="h-4 w-4" />
            </ComboboxButton>
          </div>
        </div>

        <ComboboxOptions
          anchor={menuPlacement === 'top' ? 'top start' : 'bottom start'}
          transition
          className={cx(
            'ui-popover z-50 w-[var(--input-width)] overflow-hidden rounded-lg outline-none transition duration-150 ease-out data-[closed]:translate-y-1 data-[closed]:opacity-0',
            menuPlacement === 'top' ? 'mb-2' : 'mt-2',
          )}
        >
          {searchEnabled ? (
            <div className="border-b border-[var(--ui-line)] p-2">
              <div className="ui-control rounded-md px-3">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索..."
                  className="h-8 w-full border-0 bg-transparent p-0 text-sm text-[var(--ui-ink)] outline-none placeholder:text-[var(--ui-muted)]"
                />
              </div>
            </div>
          ) : null}

          <div className="max-h-60 overflow-y-auto py-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-center text-sm text-[var(--ui-muted)]">
                无匹配结果
              </div>
            ) : (
              filteredOptions.map((option) => (
                <ComboboxOption
                  key={option.value}
                  value={option.value}
                  title={option.title}
                  className="group flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm text-[var(--ui-ink)] transition data-[focus]:bg-[color-mix(in_srgb,var(--ui-line)_34%,transparent)] data-[selected]:text-[var(--ui-accent)]"
                >
                  <span>{option.label}</span>
                  <Check className="h-4 w-4 shrink-0 opacity-0 transition group-data-[selected]:opacity-100" />
                </ComboboxOption>
              ))
            )}
          </div>
        </ComboboxOptions>
      </div>
    </Combobox>
  )
}
