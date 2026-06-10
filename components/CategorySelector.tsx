'use client'

import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react'
import { useEffect, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cx } from '@/components/ui/primitives'
import { fetchAdminCategories, type ClientCategory } from '@/lib/categories-client'

interface CategorySelectorProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

export function CategorySelector({ value, onChange, className = '' }: CategorySelectorProps) {
  const [categories, setCategories] = useState<ClientCategory[]>([])

  useEffect(() => {
    let active = true

    void fetchAdminCategories()
      .then((nextCategories) => {
        if (active) setCategories(nextCategories)
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [])

  const selectedCategory = categories.find((cat) => cat.name === value) || categories[0] || { name: 'AI', slug: 'ai' }

  return (
    <Listbox value={selectedCategory.name} onChange={onChange}>
      <div className={`relative ${className}`}>
        <ListboxButton className="group flex min-h-10 min-w-[100px] cursor-pointer items-center justify-between gap-2 rounded-[0.9rem] px-2.5 text-left text-[13px] font-medium leading-none text-[var(--ui-ink)] outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--ui-line)_42%,transparent)] hover:text-[var(--ui-ink)]">
          <span className="truncate">{selectedCategory.name}</span>
          <ChevronDown className="h-[1.05rem] w-[1.05rem] shrink-0 text-[var(--ui-muted)] transition duration-150 group-data-[hover]:text-[var(--ui-ink)] group-data-[open]:rotate-180" />
        </ListboxButton>

        <ListboxOptions
          anchor="bottom end"
          transition
          className="z-50 mt-2 min-w-[184px] rounded-[1.15rem] border border-[color-mix(in_srgb,var(--ui-line)_84%,transparent)] bg-[color-mix(in_srgb,var(--ui-bg)_94%,var(--ui-panel))] p-1.5 text-[13px] text-[var(--ui-ink)] shadow-[0_20px_48px_rgb(var(--ui-shadow-rgb)/0.12)] outline-none transition duration-150 ease-out data-[closed]:translate-y-1 data-[closed]:opacity-0"
        >
          {categories.map((cat) => (
            <ListboxOption
              key={cat.slug}
              value={cat.name}
              className={({ selected, focus }) => cx(
                'group flex cursor-pointer items-center justify-between gap-3 rounded-[0.9rem] px-3 py-2.5 text-left transition',
                selected
                  ? 'bg-[color-mix(in_srgb,var(--ui-accent)_10%,transparent)]'
                  : focus
                    ? 'bg-[color-mix(in_srgb,var(--ui-line)_40%,transparent)]'
                    : '',
              )}
            >
              <span className="truncate group-data-[selected]:text-[var(--ui-accent)]">{cat.name}</span>
              <Check className="h-[1.05rem] w-[1.05rem] shrink-0 opacity-0 transition group-data-[selected]:opacity-100 group-data-[selected]:text-[var(--ui-accent)]" />
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  )
}
