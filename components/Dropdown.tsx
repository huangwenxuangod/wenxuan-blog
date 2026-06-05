'use client'

import { SelectDropdown } from '@/components/SelectDropdown'

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
  return (
    <SelectDropdown
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
      menuPlacement={menuPlacement}
      searchable={options.length > 5}
    />
  )
}
