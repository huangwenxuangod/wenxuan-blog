'use client'

import Link from 'next/link'
import { Suspense, useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function AdminLoginForm() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!password) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      const data = await res.json().catch(() => null) as { error?: string } | null

      if (res.ok) {
        const redirectTo = searchParams.get('redirect_to') || '/admin'
        // 安全检查：只允许跳转到本站路径
        const safePath = redirectTo.startsWith('/') ? redirectTo : '/admin'
        router.push(safePath)
        router.refresh()
      } else {
        setError(
          typeof data?.error === 'string'
            ? data.error
            : res.status === 401
              ? '密码错误，请重试'
              : '登录服务暂不可用，请稍后重试'
        )
      }
    } catch {
      setError('网络错误，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--editor-app-bg)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="mb-12 text-center">
          <h1 className="text-2xl font-bold text-[var(--editor-ink)]">文轩</h1>
          <p className="mt-2 text-sm text-[var(--editor-muted)]">管理后台</p>
        </div>

        {/* 登录表单 */}
        <div>
          <form onSubmit={handleSubmit} className="space-y-8">
            <div>
              <label
                htmlFor="password"
                className="mb-3 block text-[11px] font-semibold tracking-[0.16em] text-[var(--editor-muted)] uppercase"
              >
                管理密码
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (error) setError('')
                }}
                placeholder="请输入管理密码"
                autoFocus
                autoComplete="current-password"
                className="w-full rounded-2xl border border-[color-mix(in_srgb,var(--editor-line)_88%,white)] bg-[color-mix(in_srgb,white_84%,var(--editor-soft))] px-4 py-3 text-sm text-[var(--editor-ink)] outline-none transition placeholder:text-[color-mix(in_srgb,var(--editor-muted)_78%,transparent)] focus:border-[color-mix(in_srgb,var(--editor-accent)_44%,white)] focus:bg-[color-mix(in_srgb,white_92%,var(--editor-soft))]"
              />
            </div>

            {error && (
              <p className="border-l border-rose-300 pl-3 text-sm leading-7 text-rose-600">
                {error}
              </p>
            )}

            <div className="space-y-3">
              <button
                type="submit"
                disabled={loading || !password}
                className="flex w-full items-center justify-center rounded-full bg-[var(--editor-ink)] px-4 py-3 text-sm font-medium text-[var(--editor-app-bg)] transition hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? '登录中…' : '登录'}
              </button>
              <div className="text-center text-[11px] text-[var(--editor-muted)]">仅管理员可访问</div>
            </div>
          </form>
        </div>

        <p className="mt-8 text-center text-xs text-[var(--editor-muted)]">
          <Link href="/" className="hover:text-[var(--editor-ink)] transition-colors">
            ← 返回博客首页
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function AdminLogin() {
  return (
    <Suspense fallback={null}>
      <AdminLoginForm />
    </Suspense>
  )
}
