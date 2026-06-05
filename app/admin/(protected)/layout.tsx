import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { isAdminAuthenticated, COOKIE_NAME } from '@/lib/admin-auth'
import Link from 'next/link'
import { LogoutButton } from './LogoutButton'
import { PenLine, ExternalLink } from 'lucide-react'
import { AdminFooter } from '@/components/AdminFooter'
import { AdminThemeToggle } from '@/components/AdminThemeToggle'
import { BackofficeThemeScope } from '@/components/BackofficeThemeScope'

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value

  if (!(await isAdminAuthenticated(token))) {
    redirect('/admin/login')
  }

  const navCls = 'px-3 py-2 rounded-lg text-sm text-[var(--admin-muted)] hover:text-[var(--admin-ink)] hover:bg-[var(--admin-soft)] transition-all duration-150 whitespace-nowrap'

  return (
    <div className="admin-shell min-h-screen bg-[var(--admin-bg)] flex flex-col text-[var(--admin-ink)]">
      <BackofficeThemeScope />
      <header className="sticky top-0 z-40 bg-[var(--admin-surface)]/90 border-b border-[var(--admin-line)] backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/"
              className="text-lg tracking-tight text-[var(--admin-ink)] hover:text-[var(--admin-accent)] transition-colors duration-200"
              style={{ fontFamily: 'Georgia, "Noto Serif SC", serif', fontWeight: 500 }}
            >
              文轩
            </Link>
            <span className="text-[var(--admin-line-strong)] hidden sm:inline">/</span>
            <span className="text-[var(--admin-muted)] hidden sm:inline">管理后台</span>
          </div>

          <nav className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
            <Link href="/admin/posts" className={navCls}>文章</Link>
            <Link href="/admin/categories" className={navCls}>分类</Link>
            <Link href="/admin/settings" className={navCls}>设置</Link>
            <div className="w-px h-4 bg-[var(--admin-line)] mx-2 hidden md:block" />
            <AdminThemeToggle />
            <Link
              href="/editor"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--admin-ink)] text-[var(--admin-bg)] text-sm font-medium hover:opacity-92 transition-all whitespace-nowrap"
            >
              <PenLine className="w-4 h-4" />
              <span className="hidden md:inline">写文章</span>
            </Link>
            <Link
              href="/"
              className={`${navCls} hidden md:inline-flex items-center gap-1`}
              title="查看博客"
            >
              <ExternalLink className="w-4 h-4" />
            </Link>
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl w-full px-4 sm:px-6 py-8 flex-1">{children}</main>

      <AdminFooter />
    </div>
  )
}
