'use client'

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, X } from 'lucide-react'
import { useToast } from '@/components/Toast'
import { UiButton, cx } from '@/components/ui/primitives'
import {
  buildWechatBridgeArticleExport,
  buildWechatBridgeCoverImageUrl,
  extractFirstWechatBridgeCoverImageUrl,
} from '@/lib/wechat/copy'
import type { WechatStylePresetId } from '@/lib/wechat/style-presets'
import {
  WECHAT_DEFAULT_AUTHOR,
  WECHAT_DEFAULT_NEED_OPEN_COMMENT,
  WECHAT_DEFAULT_ONLY_FANS_CAN_COMMENT,
} from '@/lib/wechat/publish-defaults'

interface BridgeAccount {
  id: string
  name: string
}

interface WeChatPublishModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  html: string
  stylePreset?: WechatStylePresetId
  defaultDigest?: string
  defaultSourceUrl?: string
  defaultCoverImageUrl?: string
}

export function WeChatPublishModal({
  isOpen,
  onClose,
  title,
  html,
  stylePreset = 'default',
  defaultDigest = '',
  defaultSourceUrl = '',
  defaultCoverImageUrl = '',
}: WeChatPublishModalProps) {
  const toast = useToast()

  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [accounts, setAccounts] = useState<BridgeAccount[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [author, setAuthor] = useState(WECHAT_DEFAULT_AUTHOR)
  const [digest, setDigest] = useState(defaultDigest)
  const [sourceUrl, setSourceUrl] = useState(defaultSourceUrl)
  const [coverImageUrl, setCoverImageUrl] = useState(defaultCoverImageUrl)
  const [generatingCover, setGeneratingCover] = useState(false)
  const [publishNow, setPublishNow] = useState(false)
  const [needOpenComment, setNeedOpenComment] = useState(WECHAT_DEFAULT_NEED_OPEN_COMMENT)
  const [onlyFansCanComment, setOnlyFansCanComment] = useState(WECHAT_DEFAULT_ONLY_FANS_CAN_COMMENT)
  const [loadError, setLoadError] = useState('')

  const loadAccounts = async () => {
    setLoadingAccounts(true)
    setLoadError('')

    try {
      const res = await fetch('/api/admin/wechat-bridge/accounts')
      const data = await res.json().catch(() => ({})) as { accounts?: BridgeAccount[]; error?: string }
      if (!res.ok) throw new Error(data.error || '加载公众号账号失败')

      const nextAccounts = data.accounts || []
      setAccounts(nextAccounts)
      setSelectedAccountId((current) => {
        if (current && nextAccounts.some(account => account.id === current)) {
          return current
        }
        return nextAccounts[0]?.id || ''
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载公众号账号失败'
      setAccounts([])
      setSelectedAccountId('')
      setLoadError(message)
    } finally {
      setLoadingAccounts(false)
    }
  }

  useEffect(() => {
    if (!isOpen) return

    setAuthor(WECHAT_DEFAULT_AUTHOR)
    setDigest(defaultDigest)
    setSourceUrl(defaultSourceUrl)
    setCoverImageUrl(defaultCoverImageUrl)
    setPublishNow(false)
    setNeedOpenComment(WECHAT_DEFAULT_NEED_OPEN_COMMENT)
    setOnlyFansCanComment(WECHAT_DEFAULT_ONLY_FANS_CAN_COMMENT)
    void loadAccounts()
  }, [isOpen, defaultDigest, defaultSourceUrl, defaultCoverImageUrl])

  const handleSubmit = async () => {
    if (!selectedAccountId) {
      toast.error('请先选择公众号账号')
      return
    }

    setSubmitting(true)

    try {
      const { normalizedTitle, exportedHtml } = await buildWechatBridgeArticleExport(title, html, stylePreset)
      const finalCoverUrl =
        buildWechatBridgeCoverImageUrl(coverImageUrl) ||
        buildWechatBridgeCoverImageUrl(defaultCoverImageUrl) ||
        extractFirstWechatBridgeCoverImageUrl(exportedHtml)

      const res = await fetch('/api/admin/wechat-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: selectedAccountId,
          title: normalizedTitle,
          content_html: exportedHtml,
          author: author.trim(),
          digest: digest.trim(),
          content_source_url: sourceUrl.trim(),
          cover_image_url: finalCoverUrl,
          publish_now: publishNow,
          need_open_comment: needOpenComment,
          only_fans_can_comment: needOpenComment && onlyFansCanComment,
        }),
      })

      const data = await res.json().catch(() => ({})) as {
        error?: string
        media_id?: string
        publish_id?: string
      }
      if (!res.ok) throw new Error(data.error || '提交公众号发布失败')

      toast.success(publishNow ? '公众号发布任务已提交' : '公众号草稿已创建')
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '提交公众号发布失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleGenerateCover = async () => {
    if (generatingCover) return

    setGeneratingCover(true)
    try {
      const response = await fetch('/api/editor/ai-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sceneKey: 'wechat_cover',
          prompt: [title.trim(), digest.trim()].filter(Boolean).join('\n'),
          articleTitle: title.trim(),
          contextText: digest.trim() || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200),
        }),
      })

      const data = await response.json().catch(() => ({})) as {
        error?: string
        image?: { url: string }
      }

      if (!response.ok || !data.image?.url) {
        throw new Error(data.error || '微信封面生成失败')
      }

      setCoverImageUrl(data.image.url)
      toast.success('微信封面已生成')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '微信封面生成失败')
    } finally {
      setGeneratingCover(false)
    }
  }

  const fieldLabelClassName = 'mb-1.5 block text-[11px] font-semibold tracking-[0.08em] text-[var(--ui-muted)]'
  const fieldClassName =
    'w-full rounded-[1rem] border border-[color-mix(in_srgb,var(--ui-line)_88%,transparent)] bg-[color-mix(in_srgb,var(--ui-bg)_92%,var(--ui-panel))] px-4 py-2.5 text-[14px] leading-6 text-[var(--ui-ink)] outline-none transition placeholder:text-[color-mix(in_srgb,var(--ui-muted)_74%,transparent)] focus:border-[color-mix(in_srgb,var(--ui-accent)_52%,var(--ui-line))]'
  const bridgeState = loadError
    ? {
        label: 'Bridge 未启用',
        className: 'border-[color-mix(in_srgb,var(--ui-danger)_24%,transparent)] bg-[color-mix(in_srgb,var(--ui-danger)_8%,transparent)] text-[var(--ui-danger)]',
      }
    : accounts.length > 0
      ? {
          label: `已连接 ${accounts.length} 个账号`,
          className: 'border-[color-mix(in_srgb,var(--ui-success)_24%,transparent)] bg-[color-mix(in_srgb,var(--ui-success)_8%,transparent)] text-[var(--ui-success)]',
        }
      : {
          label: loadingAccounts ? '正在读取账号' : '暂无可用账号',
          className: 'border-[color-mix(in_srgb,var(--ui-line)_88%,transparent)] bg-[color-mix(in_srgb,var(--ui-bg)_72%,var(--ui-soft))] text-[var(--ui-muted)]',
        }

  return (
    <Dialog open={isOpen} onClose={submitting ? () => {} : onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/45 transition duration-200 data-[closed]:opacity-0" />

      <div className="fixed inset-0 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4 sm:p-5">
          <DialogPanel className="ui-modal-panel w-full max-w-[880px] overflow-hidden rounded-[1.45rem] transition duration-200 data-[closed]:scale-[0.985] data-[closed]:opacity-0">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--ui-line)] px-5 pb-3.5 pt-4.5 sm:px-6">
              <div className="min-w-0">
                <DialogTitle as="h3" className="text-[1.2rem] font-semibold tracking-tight text-[var(--ui-ink)]">
                  发布到公众号
                </DialogTitle>
                <p className="mt-1 max-w-xl text-[12px] leading-5 text-[var(--ui-muted)]">
                  提交到 wx bridge 后创建草稿，或直接发布到目标公众号。
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="editor-quiet-icon-button h-9 w-9 shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="关闭"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="px-5 py-4 sm:px-6">
              <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.5fr)_minmax(270px,0.85fr)]">
                <div className="space-y-3.5">
                  <section className="rounded-[1.1rem] border border-[color-mix(in_srgb,var(--ui-line)_84%,transparent)] bg-[color-mix(in_srgb,var(--ui-bg)_78%,var(--ui-soft))] p-3.5">
                    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2.5">
                    <div>
                      <div className="text-sm font-medium text-[var(--ui-ink)]">发布目标</div>
                      <div className="mt-0.5 text-[11px] leading-5 text-[var(--ui-muted)]">
                        选择 wx bridge 里的公众号账号。
                      </div>
                    </div>
                    <div
                      className={cx(
                        'inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium',
                        bridgeState.className,
                      )}
                    >
                      {bridgeState.label}
                    </div>
                    </div>

                    <label className={fieldLabelClassName}>公众号账号</label>
                    <div className="flex gap-2.5">
                      <select
                        value={selectedAccountId}
                        onChange={(event) => setSelectedAccountId(event.target.value)}
                        disabled={loadingAccounts || accounts.length === 0}
                        className={cx(fieldClassName, 'h-[2.85rem] flex-1 appearance-none pr-10')}
                      >
                        {accounts.length === 0 && <option value="">暂无可用账号</option>}
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name} · {account.id}
                          </option>
                        ))}
                      </select>
                      <UiButton
                        type="button"
                        tone="soft"
                        size="lg"
                        onClick={() => void loadAccounts()}
                        disabled={loadingAccounts}
                        className="min-w-[6rem] rounded-[0.95rem] px-3"
                      >
                        {loadingAccounts ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        {loadingAccounts ? '刷新中…' : '刷新'}
                      </UiButton>
                    </div>
                    {loadError ? (
                      <p className="mt-2 text-[12px] leading-5 text-[var(--ui-danger)]">{loadError}</p>
                    ) : null}
                  </section>

                  <section className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className={fieldLabelClassName}>作者</label>
                      <input
                        type="text"
                        value={author}
                        onChange={(event) => setAuthor(event.target.value)}
                        placeholder={WECHAT_DEFAULT_AUTHOR}
                        className={fieldClassName}
                      />
                    </div>

                    <div>
                      <label className={fieldLabelClassName}>原文链接</label>
                      <input
                        type="url"
                        value={sourceUrl}
                        onChange={(event) => setSourceUrl(event.target.value)}
                        placeholder="选填"
                        className={fieldClassName}
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className={fieldLabelClassName}>摘要</label>
                      <textarea
                        value={digest}
                        onChange={(event) => setDigest(event.target.value)}
                        rows={2}
                        placeholder="默认使用文章描述，选填"
                        className={cx(fieldClassName, 'min-h-[5.2rem]')}
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className={fieldLabelClassName}>封面图 URL</label>
                      <div className="flex gap-2.5">
                        <input
                          type="url"
                          value={coverImageUrl}
                          onChange={(event) => setCoverImageUrl(event.target.value)}
                          placeholder="留空时会自动使用默认封面"
                          className={cx(fieldClassName, 'flex-1')}
                        />
                        <UiButton
                          type="button"
                          tone="soft"
                          size="lg"
                          onClick={() => void handleGenerateCover()}
                          disabled={generatingCover}
                          className="shrink-0 rounded-[0.95rem] px-3"
                        >
                          {generatingCover ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                          {generatingCover ? '生成中…' : '生成封面'}
                        </UiButton>
                      </div>
                      <p className="mt-1 text-[11px] leading-5 text-[var(--ui-muted)]">
                        `/api/images/...` 会自动转成适合微信上传的 JPG。
                      </p>
                    </div>
                  </section>
                </div>

                <section className="rounded-[1.1rem] border border-[color-mix(in_srgb,var(--ui-line)_84%,transparent)] bg-[color-mix(in_srgb,var(--ui-bg)_72%,var(--ui-panel))] p-3.5">
                  <div className="mb-2.5">
                    <div className="text-sm font-medium text-[var(--ui-ink)]">发布选项</div>
                    <div className="mt-1 text-[11px] leading-5 text-[var(--ui-muted)]">
                      评论权限会随 bridge 配置一并提交。
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="flex items-start gap-3 rounded-[0.85rem] px-3 py-2 text-sm text-[var(--ui-ink)] transition hover:bg-[color-mix(in_srgb,var(--ui-line)_26%,transparent)]">
                      <input
                        type="checkbox"
                        checked={publishNow}
                        onChange={(event) => setPublishNow(event.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-[var(--ui-line)] accent-[var(--ui-accent)]"
                      />
                      <span>
                        <span className="block font-medium">创建草稿后立即提交发布</span>
                        <span className="mt-0.5 block text-[11px] leading-5 text-[var(--ui-muted)]">
                          不勾选时仅创建草稿。
                        </span>
                      </span>
                    </label>

                    <label className="flex items-start gap-3 rounded-[0.85rem] px-3 py-2 text-sm text-[var(--ui-ink)] transition hover:bg-[color-mix(in_srgb,var(--ui-line)_26%,transparent)]">
                      <input
                        type="checkbox"
                        checked={needOpenComment}
                        onChange={(event) => {
                          setNeedOpenComment(event.target.checked)
                          if (!event.target.checked) setOnlyFansCanComment(false)
                        }}
                        className="mt-0.5 h-4 w-4 rounded border-[var(--ui-line)] accent-[var(--ui-accent)]"
                      />
                      <span>
                        <span className="block font-medium">开启评论</span>
                        <span className="mt-0.5 block text-[11px] leading-5 text-[var(--ui-muted)]">
                          发布后允许读者评论。
                        </span>
                      </span>
                    </label>

                    <label
                      className={cx(
                        'flex items-start gap-3 rounded-[0.85rem] px-3 py-2 text-sm transition',
                        needOpenComment
                          ? 'text-[var(--ui-ink)] hover:bg-[color-mix(in_srgb,var(--ui-line)_26%,transparent)]'
                          : 'text-[var(--ui-muted)] opacity-60',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={onlyFansCanComment}
                        onChange={(event) => setOnlyFansCanComment(event.target.checked)}
                        disabled={!needOpenComment}
                        className="mt-0.5 h-4 w-4 rounded border-[var(--ui-line)] accent-[var(--ui-accent)]"
                      />
                      <span>
                        <span className="block font-medium">仅粉丝可评论</span>
                        <span className="mt-0.5 block text-[11px] leading-5 text-[var(--ui-muted)]">
                          仅在已开启评论时生效。
                        </span>
                      </span>
                    </label>
                  </div>
                </section>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-[var(--ui-line)] px-5 py-3.5 sm:px-6">
              <UiButton
                type="button"
                tone="quiet"
                size="lg"
                onClick={onClose}
                disabled={submitting}
                className="rounded-[1.1rem] px-5"
              >
                取消
              </UiButton>
              <UiButton
                type="button"
                tone="solid"
                size="lg"
                onClick={() => void handleSubmit()}
                disabled={submitting || loadingAccounts || accounts.length === 0}
                className="rounded-[1.1rem] px-5"
              >
                {submitting ? '提交中…' : publishNow ? '提交发布' : '创建草稿'}
              </UiButton>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}
