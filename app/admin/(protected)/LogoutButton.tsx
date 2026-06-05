'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { Tooltip } from '@/components/ui/Tooltip'

export function LogoutButton() {
  const router = useRouter()

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' })
    router.push('/admin/login')
    router.refresh()
  }

  return (
    <Tooltip content="退出登录">
      <button
        type="button"
        onClick={handleLogout}
        className="p-2 rounded-lg text-[var(--editor-muted)] hover:text-rose-500 hover:bg-[var(--editor-soft)] transition-all"
        aria-label="退出登录"
      >
        <LogOut className="w-4 h-4" />
      </button>
    </Tooltip>
  )
}

