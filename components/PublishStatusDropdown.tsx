'use client'

import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react'
import { Check, ChevronDown, Eye, Globe, Link2, Lock } from 'lucide-react'
import { cx } from '@/components/ui/primitives'

export type PublishStatus = 'public' | 'draft' | 'encrypted' | 'unlisted'

interface PublishStatusDropdownProps {
  value: PublishStatus
  onChange: (status: PublishStatus) => void
  disabled?: boolean
}

const STATUS_CONFIG = {
  public: {
    label: '公开访问',
    icon: Globe,
    description: '所有人可见，出现在首页和搜索',
  },
  draft: {
    label: '草稿自见',
    icon: Eye,
    description: '仅自己可见，不会发布',
  },
  encrypted: {
    label: '加密访问',
    icon: Lock,
    description: '需要密码才能查看',
  },
  unlisted: {
    label: '链接访问',
    icon: Link2,
    description: '不在首页显示，但可通过链接访问',
  },
} satisfies Record<PublishStatus, {
  label: string
  icon: typeof Globe
  description: string
}>

export function PublishStatusDropdown({ value, onChange, disabled }: PublishStatusDropdownProps) {
  const currentConfig = STATUS_CONFIG[value]
  const CurrentIcon = currentConfig.icon

  return (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
      <div className="relative">
        <ListboxButton
          className={cx(
            'ui-control group inline-flex min-h-[2.5rem] items-center gap-2 rounded-[0.9rem] px-3 text-sm text-[var(--ui-ink)]',
            disabled && 'ui-control-disabled',
          )}
        >
          <CurrentIcon className="h-4 w-4 shrink-0 text-[var(--ui-muted)]" />
          <span className="truncate">{currentConfig.label}</span>
          <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-[var(--ui-muted)] transition duration-150 group-data-[open]:rotate-180 group-data-[hover]:text-[var(--ui-ink)]" />
        </ListboxButton>

        <ListboxOptions
          anchor="bottom end"
          transition
          className="ui-popover z-50 mt-2 w-64 overflow-hidden rounded-[1rem] outline-none transition duration-150 ease-out data-[closed]:translate-y-1 data-[closed]:opacity-0"
        >
          <div className="py-1">
            {(Object.entries(STATUS_CONFIG) as [PublishStatus, typeof STATUS_CONFIG[PublishStatus]][]).map(
              ([status, config]) => {
                const StatusIcon = config.icon

                return (
                  <ListboxOption
                    key={status}
                    value={status}
                    className="group flex cursor-pointer items-start justify-between gap-3 px-3 py-2.5 text-left text-[var(--ui-ink)] transition data-[focus]:bg-[color-mix(in_srgb,var(--ui-line)_34%,transparent)] data-[selected]:text-[var(--ui-accent)]"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <StatusIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ui-muted)] transition group-data-[selected]:text-[var(--ui-accent)]" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium leading-5">{config.label}</div>
                        <div className="mt-0.5 text-xs leading-5 text-[var(--ui-muted)] group-data-[selected]:text-[var(--ui-accent)]/80">
                          {config.description}
                        </div>
                      </div>
                    </div>
                    <Check className="mt-0.5 h-4 w-4 shrink-0 opacity-0 transition group-data-[selected]:opacity-100" />
                  </ListboxOption>
                )
              },
            )}
          </div>
        </ListboxOptions>
      </div>
    </Listbox>
  )
}
