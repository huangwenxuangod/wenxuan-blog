'use client'

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { X, Download, Palette, Type, Check, Loader2, Image as ImageIcon } from 'lucide-react'
import { useEffect, useRef, useState, useMemo } from 'react'
import { cx } from '@/components/ui/primitives'
import { useToast } from '@/components/Toast'
import { saveBlobFile } from '@/lib/client-download'

interface ShareLongImageModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  html: string
  coverImage?: string | null
  category?: string
  authorName?: string
  siteUrl?: string
}

type CardTheme = 'parchment' | 'white' | 'dark'
type CardFont = 'serif' | 'sans'

export function ShareLongImageModal({
  isOpen,
  onClose,
  title,
  html,
  coverImage,
  category = 'AI',
  authorName = '黄文轩',
  siteUrl = 'https://huangwenxuangod.xyz',
}: ShareLongImageModalProps) {
  const toast = useToast()
  const [theme, setTheme] = useState<CardTheme>('parchment')
  const [font, setFont] = useState<CardFont>('serif')
  const [generating, setGenerating] = useState(false)
  const [qrCodeUrl, setQrCodeUrl] = useState('')
  const cardRef = useRef<HTMLDivElement>(null)

  // Clean HTML for sharing: remove interactive blocks, placeholders or empty editor nodes
  const cleanHtml = useMemo(() => {
    if (typeof window === 'undefined') return html
    const doc = new DocumentFragment()
    const div = document.createElement('div')
    div.innerHTML = html
    doc.appendChild(div)

    // Remove empty paragraphs or editor-only artifacts
    div.querySelectorAll('.upload-placeholder, .editor-toc-toggle, button').forEach(el => el.remove())
    
    return div.innerHTML
  }, [html])

  const handleDownload = async () => {
    if (generating) return
    setGenerating(true)
    toast.info('正在渲染高画质长图，请稍候…')

    try {
      const html2canvas = (await import('html2canvas')).default
      const element = cardRef.current
      if (!element) throw new Error('找不到渲染节点')

      // Generate canvas with high-res scale and enabled CORS for images
      const canvas = await html2canvas(element, {
        useCORS: true,
        scale: 2, // 2x scale for retina/crisp text
        backgroundColor: theme === 'parchment' ? '#f5f4ed' : theme === 'white' ? '#ffffff' : '#121212',
        logging: false,
        allowTaint: false,
      })

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((nextBlob) => {
          if (!nextBlob) {
            reject(new Error('生成长图文件失败'))
            return
          }
          resolve(nextBlob)
        }, 'image/png')
      })

      await saveBlobFile(blob, `${title.trim() || 'share-card'}-长图分享.png`, {
        types: [
          {
            description: 'PNG Image',
            accept: {
              'image/png': ['.png'],
            },
          },
        ],
      })
      toast.success('长图分享生成成功，已保存到浏览器下载目录。')
    } catch (err) {
      console.error('[Share Card Error]', err)
      toast.error('长图生成失败，请重试')
    } finally {
      setGenerating(false)
    }
  }

  const themeStyles = {
    parchment: {
      border: 'border-[#e4e2d5]',
      divider: 'bg-[#d3d1c4]',
      coverBg: 'bg-[#ebe9dd]',
      secondaryText: 'text-[#5e5449]'
    },
    white: {
      border: 'border-[#e5e7eb]',
      divider: 'bg-[#d1d5db]',
      coverBg: 'bg-[#f3f4f6]',
      secondaryText: 'text-[#6b7280]'
    },
    dark: {
      border: 'border-[#27272a]',
      divider: 'bg-[#3f3f46]',
      coverBg: 'bg-[#1a1a1a]',
      secondaryText: 'text-[#9ca3af]'
    }
  }[theme]

  useEffect(() => {
    let cancelled = false

    const buildQrCode = async () => {
      try {
        const { toDataURL } = await import('qrcode')
        const nextUrl = await toDataURL(siteUrl, {
          margin: 1,
          width: 150,
          color: {
            dark: theme === 'dark' ? '#ffffff' : '#000000',
            light: theme === 'parchment' ? '#f5f4ed' : theme === 'white' ? '#ffffff' : '#121212',
          },
        })

        if (!cancelled) {
          setQrCodeUrl(nextUrl)
        }
      } catch (error) {
        if (!cancelled) {
          console.error('[Share Card QR Error]', error)
          setQrCodeUrl('')
        }
      }
    }

    void buildQrCode()

    return () => {
      cancelled = true
    }
  }, [siteUrl, theme])

  return (
    <Dialog open={isOpen} onClose={generating ? () => {} : onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/55 transition duration-200 data-[closed]:opacity-0" />

      <div className="fixed inset-0 flex items-center justify-center p-4 md:p-6">
        <DialogPanel className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--ui-line)_84%,transparent)] bg-[var(--ui-panel)] shadow-[0_24px_64px_rgb(0_0_0/0.18)] transition duration-200 data-[closed]:scale-95 data-[closed]:opacity-0 md:flex-row">
          
          {/* Left Side: Scrollable Preview */}
          <div className="share-card-preview-scroll flex flex-1 justify-center items-start overflow-y-auto bg-[color-mix(in_srgb,var(--ui-line)_15%,transparent)] p-6">
            <div className="relative shadow-2xl rounded-xl overflow-hidden">
              {/* Actual share card that will be screenshotted */}
              <div
                ref={cardRef}
                id="share-card-container"
                data-share-theme={theme}
                className={cx(
                  'w-[520px] p-10 flex flex-col transition-colors duration-200',
                  theme === 'parchment' && 'bg-[#f5f4ed] text-[#2c2621]',
                  theme === 'white' && 'bg-[#ffffff] text-[#111111]',
                  theme === 'dark' && 'bg-[#121212] text-[#e5e5e5]',
                  font === 'serif' ? 'font-serif' : 'font-sans'
                )}
              >
                {/* Brand Header */}
                <div className={cx("flex items-center justify-between pb-6 mb-8 border-b text-xs tracking-widest uppercase", themeStyles.border, themeStyles.secondaryText)}>
                  <span>文轩 · WENXUAN</span>
                  <span>{category}</span>
                </div>

                {/* Cover Image */}
                {coverImage && (
                  <div className={cx("mb-8 overflow-hidden rounded-xl aspect-[16/9] w-full relative flex items-center justify-center", themeStyles.coverBg)}>
                    <img
                      src={coverImage}
                      alt={title}
                      className="w-full h-full object-cover"
                      crossOrigin="anonymous"
                    />
                  </div>
                )}

                {/* Article Title */}
                <h1 className="text-3xl font-bold leading-snug tracking-tight mb-4">
                  {title || '无标题文章'}
                </h1>

                {/* Metadata */}
                <div className={cx("flex items-center gap-3 text-xs mb-8 font-sans", themeStyles.secondaryText)}>
                  <span>作者: {authorName}</span>
                  <span>•</span>
                  <span>{new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                </div>

                {/* Content Divider */}
                <div className={cx("w-12 h-1 rounded mb-8", themeStyles.divider)} />

                {/* Article Prose Content */}
                <div
                  className="share-card-prose flex-1 text-[15px] leading-relaxed break-words"
                  dangerouslySetInnerHTML={{ __html: cleanHtml }}
                />

                {/* Footer Section */}
                <div className={cx("mt-12 pt-8 border-t flex items-center justify-between gap-6", themeStyles.border)}>
                  <div className="flex-1 min-w-0 font-sans">
                    <p className="text-sm font-semibold tracking-wide mb-1.5">阅读原文</p>
                    <p className={cx("text-xs truncate mb-1", themeStyles.secondaryText)}>{siteUrl}</p>
                    <p className={cx("text-[10px] opacity-70", themeStyles.secondaryText)}>长按识别二维码或浏览器中打开链接</p>
                  </div>
                  <div className="w-20 h-20 shrink-0 bg-white p-1 rounded-lg shadow-sm flex items-center justify-center">
                    {qrCodeUrl ? (
                      <img src={qrCodeUrl} alt="QR Code" className="w-full h-full" />
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Options and Actions */}
          <div className="w-full md:w-80 shrink-0 border-t md:border-t-0 md:border-l border-[color-mix(in_srgb,var(--ui-line)_84%,transparent)] bg-[var(--ui-panel)] p-6 flex flex-col justify-between">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <DialogTitle as="h3" className="text-base font-bold text-[var(--ui-ink)]">
                  分享卡片设计
                </DialogTitle>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={generating}
                  className="editor-quiet-icon-button h-8 w-8 shrink-0 disabled:cursor-not-allowed disabled:opacity-40 outline-none focus:outline-none"
                  aria-label="关闭"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Theme Selector */}
              <div className="space-y-2.5">
                <label className="text-xs font-semibold text-[var(--ui-muted)] flex items-center gap-1.5">
                  <Palette className="h-3.5 w-3.5" />
                  卡片配色
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['parchment', 'white', 'dark'] as CardTheme[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTheme(t)}
                      className={cx(
                        'flex h-10 items-center justify-center rounded-xl border text-xs font-medium transition-all relative outline-none focus:outline-none focus-visible:outline-none',
                        t === 'parchment' && 'bg-[#f5f4ed] text-[#2c2621] border-[#e4e2d5]',
                        t === 'white' && 'bg-white text-black border-gray-200',
                        t === 'dark' && 'bg-black text-white border-zinc-800',
                        theme === t
                          ? 'border-[var(--ui-accent)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--ui-accent)_48%,transparent)]'
                          : 'hover:scale-[1.02]'
                      )}
                    >
                      {t === 'parchment' && '羊皮纸'}
                      {t === 'white' && '简约白'}
                      {t === 'dark' && '深邃黑'}
                      {theme === t && (
                        <Check className={cx('absolute right-1 top-1 h-3 w-3', t === 'dark' ? 'text-white' : 'text-black')} />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Font Selector */}
              <div className="space-y-2.5">
                <label className="text-xs font-semibold text-[var(--ui-muted)] flex items-center gap-1.5">
                  <Type className="h-3.5 w-3.5" />
                  字体排版
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['serif', 'sans'] as CardFont[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFont(f)}
                      className={cx(
                        'flex h-10 items-center justify-center rounded-xl border text-xs font-medium transition-all outline-none focus:outline-none focus-visible:outline-none',
                        font === f
                          ? 'border-[var(--ui-accent)] bg-[color-mix(in_srgb,var(--ui-accent)_10%,transparent)] text-[var(--ui-accent)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--ui-accent)_40%,transparent)]'
                          : 'border-[color-mix(in_srgb,var(--ui-line)_84%,transparent)] text-[var(--ui-ink)] hover:bg-[color-mix(in_srgb,var(--ui-line)_42%,transparent)]'
                      )}
                    >
                      {f === 'serif' ? '古典宋体' : '极简黑体'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Download Button */}
            <div className="pt-6 border-t border-[color-mix(in_srgb,var(--ui-line)_84%,transparent)] mt-6">
              <button
                type="button"
                onClick={handleDownload}
                disabled={generating}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--ui-accent)] py-3 text-sm font-semibold text-[var(--ui-accent-ink)] transition hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 outline-none focus:outline-none focus-visible:outline-none"
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {generating ? '正在生成…' : '下载长图分享'}
              </button>
            </div>
          </div>

        </DialogPanel>
      </div>
    </Dialog>
  )
}
