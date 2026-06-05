'use client'

import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react'
import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

interface Category {
  name: string
  slug: string
}

interface CategorySelectorProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

interface CategoriesResponse {
  categories?: Category[]
}

export function CategorySelector({ value, onChange, className = '' }: CategorySelectorProps) {
  const [categories, setCategories] = useState<Category[]>([])

  useEffect(() => {
    fetch('/api/admin/categories')
      .then((r) => r.json() as Promise<Category[] | CategoriesResponse>)
      .then((data: Category[] | CategoriesResponse) => {
        const cats = Array.isArray(data) ? data : data?.categories
        if (Array.isArray(cats)) setCategories(cats)
      })
      .catch(() => {})
  }, [])

  const allCategories = useMemo(() => ([
    { name: '未分类', slug: 'uncategorized' },
    ...categories.filter((c) => c.name !== '未分类'),
  ]), [categories])

  const selectedCategory = allCategories.find((cat) => cat.name === value) || allCategories[0]

  return (
    <Listbox value={selectedCategory.name} onChange={onChange}>
      <div className={`relative ${className}`}>
        <ListboxButton className="group flex min-h-9 min-w-[92px] cursor-pointer items-center justify-between gap-2 text-left text-[14px] leading-none text-[var(--editor-ink)] outline-none transition-colors hover:text-[var(--editor-accent)]">
          <span className="truncate">{selectedCategory.name}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--editor-muted)] transition duration-150 group-data-[hover]:text-[var(--editor-ink)] group-data-[open]:rotate-180" />
        </ListboxButton>

        <ListboxOptions
          anchor="bottom end"
          transition
          className="z-50 mt-2 min-w-[180px] bg-[var(--background)] py-1 text-[14px] text-[var(--editor-ink)] shadow-[0_12px_32px_rgba(0,0,0,0.08)] outline-none transition duration-150 ease-out data-[closed]:translate-y-1 data-[closed]:opacity-0"
        >
          {allCategories.map((cat) => (
            <ListboxOption
              key={cat.slug}
              value={cat.name}
              className="group flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left transition data-[focus]:bg-[color-mix(in_srgb,var(--editor-line)_34%,transparent)]"
            >
              <span className="truncate group-data-[selected]:text-[var(--editor-accent)]">{cat.name}</span>
              <Check className="h-3.5 w-3.5 shrink-0 opacity-0 transition group-data-[selected]:opacity-100 group-data-[selected]:text-[var(--editor-accent)]" />
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  )
}
