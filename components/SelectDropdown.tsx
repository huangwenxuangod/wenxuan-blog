'use client'

import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from '@headlessui/react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cx } from '@/components/ui/primitives'

interface SelectOption {
  value: string
  label: string
  title?: string
  searchText?: string
}

interface SelectDropdownProps {
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  menuPlacement?: 'top' | 'bottom'
  searchable?: boolean
  searchPlaceholder?: string
  emptyText?: string
}

export function SelectDropdown({
  options,
  value,
  onChange,
  placeholder = '请选择',
  className = '',
  disabled = false,
  menuPlacement = 'bottom',
  searchable = false,
  searchPlaceholder = '搜索...',
  emptyText = '无匹配结果',
}: SelectDropdownProps) {
  const [query, setQuery] = useState('')

  const selectedOption = options.find((option) => option.value === value) || null

  const filteredOptions = useMemo(() => {
    if (!searchable) return options
    const keyword = query.trim().toLowerCase()
    if (!keyword) return options
    return options.filter((option) =>
      `${option.label} ${option.searchText || ''}`.toLowerCase().includes(keyword),
    )
  }, [options, query, searchable])

  return (
    <Listbox
      value={value}
      onChange={(nextValue: string) => {
        onChange(nextValue)
        setQuery('')
      }}
      disabled={disabled}
    >
      <div className={cx('relative', className)}>
        <ListboxButton
          className={cx(
            'ui-control group flex min-h-[2.75rem] w-full items-center justify-between gap-2 rounded-[0.95rem] px-3 text-left',
            disabled && 'ui-control-disabled',
          )}
          title={selectedOption?.title}
        >
          <span
            className={cx(
              'truncate text-sm',
              selectedOption ? 'text-[var(--ui-ink)]' : 'text-[var(--ui-muted)]',
            )}
          >
            {selectedOption?.label || placeholder}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--ui-muted)] transition duration-150 group-data-[open]:rotate-180 group-data-[hover]:text-[var(--ui-ink)]" />
        </ListboxButton>

        <ListboxOptions
          anchor={menuPlacement === 'top' ? 'top start' : 'bottom start'}
          transition
          className={cx(
            'ui-popover z-50 w-[var(--button-width)] overflow-hidden rounded-[1rem] outline-none transition duration-150 ease-out data-[closed]:translate-y-1 data-[closed]:opacity-0',
            menuPlacement === 'top' ? 'mb-2' : 'mt-2',
          )}
        >
          {searchable ? (
            <div className="border-b border-[var(--ui-line)] p-2">
              <div className="ui-control flex min-h-[2.25rem] items-center gap-2 rounded-[0.8rem] px-3">
                <Search className="h-3.5 w-3.5 shrink-0 text-[var(--ui-muted)]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-8 w-full border-0 bg-transparent p-0 text-sm text-[var(--ui-ink)] outline-none placeholder:text-[var(--ui-muted)]"
                />
              </div>
            </div>
          ) : null}

          <div className="modal-scrollbar-none max-h-60 overflow-y-auto py-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-center text-sm text-[var(--ui-muted)]">
                {emptyText}
              </div>
            ) : (
              filteredOptions.map((option) => (
                <ListboxOption
                  key={option.value}
                  value={option.value}
                  title={option.title}
                  className="group flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm text-[var(--ui-ink)] transition data-[focus]:bg-[color-mix(in_srgb,var(--ui-line)_34%,transparent)] data-[selected]:text-[var(--ui-accent)]"
                >
                  <span className="truncate">{option.label}</span>
                  <Check className="h-4 w-4 shrink-0 opacity-0 transition group-data-[selected]:opacity-100" />
                </ListboxOption>
              ))
            )}
          </div>
        </ListboxOptions>
      </div>
    </Listbox>
  )
}
