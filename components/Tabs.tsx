'use client'

import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react'
import { cx } from '@/components/ui/primitives'
import type { ReactNode } from 'react'

interface TabItem {
  id: string
  label: string
  content: ReactNode
}

interface TabsProps {
  tabs: TabItem[]
  defaultTab?: string
  selectedTab?: string
  onTabChange?: (tabId: string) => void
}

export function Tabs({ tabs, defaultTab, selectedTab, onTabChange }: TabsProps) {
  const defaultIndex = Math.max(0, tabs.findIndex((tab) => tab.id === defaultTab))
  const selectedIndex = selectedTab
    ? Math.max(0, tabs.findIndex((tab) => tab.id === selectedTab))
    : undefined

  return (
    <TabGroup
      defaultIndex={defaultIndex}
      selectedIndex={selectedIndex}
      onChange={(index) => onTabChange?.(tabs[index]?.id || tabs[0]?.id || '')}
    >
      <div className="border-b border-[var(--editor-line)] pb-1">
        <TabList className="flex flex-wrap gap-x-5 gap-y-2">
          {tabs.map((tab) => (
            <Tab
              key={tab.id}
              className={({ selected }) => cx(
                'ui-tab-trigger px-0 py-2 text-sm font-medium outline-none',
                selected && 'text-[var(--ui-accent)]',
              )}
            >
              {({ selected }) => (
                <>
                  {tab.label}
                  <span
                    className={cx(
                      'absolute inset-x-0 bottom-0 h-px bg-transparent transition-colors',
                      selected && 'bg-[var(--ui-accent)]',
                    )}
                  />
                </>
              )}
            </Tab>
          ))}
        </TabList>
      </div>

      <TabPanels className="pt-6">
        {tabs.map((tab) => (
          <TabPanel key={tab.id}>
            {tab.content}
          </TabPanel>
        ))}
      </TabPanels>
    </TabGroup>
  )
}
