'use client'

import { useEffect, useMemo, useState } from 'react'
import { Dropdown } from '@/components/Dropdown'
import { useToast } from '@/components/Toast'
import type { AIImageAspectRatio, AIImageResolution } from '@/lib/ai-image/options'

type GeneratorTarget = 'summary' | 'tags' | 'slug' | 'cover'
type ProviderMode = 'workers_ai' | 'profile'

interface GeneratorConfig {
  id: number
  target_key: GeneratorTarget
  label: string
  description: string
  prompt: string
  provider_mode: ProviderMode
  text_profile_id: number | null
  image_profile_id: number | null
  workers_model: string
  temperature: number
  max_tokens: number
  aspect_ratio: AIImageAspectRatio
  resolution: AIImageResolution
  is_enabled: number
}

interface TextProfile {
  id: number
  name: string
  model: string
  is_default: number
}

const TARGET_ORDER: GeneratorTarget[] = ['summary', 'tags', 'slug', 'cover']

function toNumericInput(value: number) {
  return Number.isFinite(value) ? String(value) : ''
}

export function AiPostGeneratorsManager() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [savingTarget, setSavingTarget] = useState<GeneratorTarget | null>(null)
  const [items, setItems] = useState<Record<GeneratorTarget, GeneratorConfig> | null>(null)
  const [textProfiles, setTextProfiles] = useState<TextProfile[]>([])
  const [workersTextModels, setWorkersTextModels] = useState<string[]>([])
  const [loadingWorkersModelsTarget, setLoadingWorkersModelsTarget] = useState<GeneratorTarget | null>(null)
  const [workersModelsWarning, setWorkersModelsWarning] = useState<Record<GeneratorTarget, string>>({
    summary: '',
    tags: '',
    slug: '',
    cover: '',
  })

  const textProfileOptions = useMemo(
    () => textProfiles.map((profile) => ({
      value: String(profile.id),
      label: `${profile.is_default ? `${profile.name}（默认）` : profile.name} · ${profile.model}`,
    })),
    [textProfiles],
  )

  useEffect(() => {
    const load = async () => {
      try {
        const [generatorsRes, textProfilesRes] = await Promise.all([
          fetch('/api/admin/ai-post-generators'),
          fetch('/api/admin/ai-provider'),
        ])

        if (!generatorsRes.ok) throw new Error('加载元数据生成配置失败')

        const generatorsData = await generatorsRes.json() as {
          generators?: GeneratorConfig[]
          workers_ai?: {
            text_models?: string[]
          }
        }
        const textProfilesData = await textProfilesRes.json().catch(() => ({ profiles: [] })) as {
          profiles?: TextProfile[]
        }

        const nextItems = {} as Record<GeneratorTarget, GeneratorConfig>
        for (const generator of generatorsData.generators || []) {
          nextItems[generator.target_key] = generator
        }

        setItems(nextItems)
        setTextProfiles(textProfilesData.profiles || [])
        setWorkersTextModels(generatorsData.workers_ai?.text_models || [])
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '加载失败')
      } finally {
        setLoading(false)
      }
    }

    void load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateItem = (target: GeneratorTarget, patch: Partial<GeneratorConfig>) => {
    setItems((current) => {
      if (!current?.[target]) return current
      return {
        ...current,
        [target]: {
          ...current[target],
          ...patch,
        },
      }
    })
  }

  const saveItem = async (target: GeneratorTarget) => {
    const item = items?.[target]
    if (!item) return

    setSavingTarget(target)
    try {
      const payload = {
        target_key: item.target_key,
        prompt: item.prompt,
        provider_mode: item.provider_mode,
        text_profile_id: item.text_profile_id,
        image_profile_id: item.image_profile_id,
        workers_model: item.workers_model,
        temperature: Number(item.temperature),
        max_tokens: Number(item.max_tokens),
        aspect_ratio: item.aspect_ratio,
        resolution: item.resolution,
        is_enabled: item.is_enabled,
      }

      const res = await fetch('/api/admin/ai-post-generators', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json().catch(() => ({})) as { error?: string; generator?: GeneratorConfig }
      if (!res.ok || !data.generator) {
        throw new Error(data.error || '保存失败')
      }

      updateItem(target, data.generator)
      toast.success(`${item.label}已保存`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSavingTarget(null)
    }
  }

  const loadWorkersModels = async (target: GeneratorTarget) => {
    if (target === 'cover') return

    const kind = 'text'
    setLoadingWorkersModelsTarget(target)
    setWorkersModelsWarning((current) => ({ ...current, [target]: '' }))
    try {
      const res = await fetch(`/api/admin/workers-ai-models?kind=${kind}`)
      const data = await res.json().catch(() => ({})) as {
        models?: Array<{ id: string; name: string }>
        warning?: string
        error?: string
      }
      if (!res.ok) {
        throw new Error(data.error || '获取 Workers AI 模型失败')
      }

      const ids = (data.models || []).map((item) => item.id).filter(Boolean)
      setWorkersTextModels(ids)

      if (data.warning) {
        setWorkersModelsWarning((current) => ({ ...current, [target]: data.warning || '' }))
        toast.warning(data.warning)
      } else {
        toast.success(`已加载 ${ids.length} 个 Workers AI 模型`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '获取 Workers AI 模型失败')
    } finally {
      setLoadingWorkersModelsTarget(null)
    }
  }

  if (loading || !items) {
    return <div className="py-8 text-center text-sm text-[var(--editor-muted)]">加载中…</div>
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[var(--editor-line)] bg-[var(--editor-panel)] p-5">
        <h3 className="text-base font-semibold text-[var(--editor-ink)]">文章元数据 AI 生成</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--editor-muted)]">
          为摘要、标签、slug 和封面分别配置生成提示词。文本字段可选择 Workers AI 或后台已配置的文本模型；封面的图片模型与模板统一在「图片模板 {'>'} 场景绑定 {'>'} 文章封面」中管理。
        </p>
      </div>

      {TARGET_ORDER.map((target) => {
        const item = items[target]
        if (!item) return null
        const isCover = target === 'cover'
        const workersModelOptions = workersTextModels.map((model) => ({ value: model, label: model }))

        return (
          <section
            key={target}
            className="rounded-2xl border border-[var(--editor-line)] bg-[var(--editor-panel)] p-5"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="text-base font-semibold text-[var(--editor-ink)]">{item.label}</div>
                <p className="mt-1 text-sm leading-6 text-[var(--editor-muted)]">
                  {isCover
                    ? '文章封面的模型、比例、分辨率与模板已统一收口到「图片模板」里的「文章封面」场景绑定；这里仅保留封面提示文案和启用状态。'
                    : item.description}
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-[var(--editor-ink)]">
                <input
                  type="checkbox"
                  checked={item.is_enabled === 1}
                  onChange={(event) => updateItem(target, { is_enabled: event.target.checked ? 1 : 0 })}
                  className="h-4 w-4 rounded border-[var(--editor-line)]"
                />
                启用
              </label>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              {isCover ? null : (
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--editor-ink)]">模型来源</label>
                  <select
                    value={item.provider_mode}
                    onChange={(event) => updateItem(target, {
                      provider_mode: event.target.value === 'profile' ? 'profile' : 'workers_ai',
                    })}
                    className="w-full rounded-xl border border-[var(--ui-line)] bg-[var(--ui-surface)] px-3 py-2.5 text-sm text-[var(--ui-ink)] outline-none focus:border-[var(--ui-accent)]"
                  >
                    <option value="workers_ai">Workers AI</option>
                    <option value="profile">已配置文本模型</option>
                  </select>
                </div>
              )}

              {isCover ? (
                <div className="rounded-2xl border border-[color-mix(in_srgb,var(--ui-line)_88%,transparent)] bg-[color-mix(in_srgb,var(--ui-bg)_92%,var(--ui-soft))] px-4 py-3 text-sm leading-6 text-[var(--ui-muted)] md:col-span-2">
                  请到「图片模板」中的「场景绑定」配置 `文章封面`，封面生成会严格复用那里选中的模板、默认模型、比例与分辨率。
                </div>
              ) : null}

              {isCover ? null : item.provider_mode === 'workers_ai' ? (
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--editor-ink)]">
                    Workers AI 模型
                  </label>
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <div className="text-xs text-[var(--editor-muted)]">可直接输入，也可以拉取后搜索。</div>
                    <button
                      type="button"
                      onClick={() => void loadWorkersModels(target)}
                      disabled={loadingWorkersModelsTarget !== null}
                      className="text-xs font-medium text-[var(--editor-accent)] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {loadingWorkersModelsTarget === target ? '拉取中…' : '拉取模型'}
                    </button>
                  </div>
                  <input
                    value={item.workers_model}
                    onChange={(event) => updateItem(target, { workers_model: event.target.value })}
                    className="w-full rounded-xl border border-[var(--ui-line)] bg-[var(--ui-surface)] px-3 py-2.5 text-sm text-[var(--ui-ink)] outline-none focus:border-[var(--ui-accent)]"
                    placeholder="@cf/meta/llama-3.1-8b-instruct"
                  />
                  {workersModelOptions.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      <Dropdown
                        options={workersModelOptions}
                        value={item.workers_model}
                        onChange={(value) => updateItem(target, { workers_model: value })}
                        placeholder={`搜索并选择已加载的 ${workersModelOptions.length} 个 Workers AI 模型`}
                      />
                      <div className="text-xs text-[var(--editor-muted)]">
                        已加载 {workersModelOptions.length} 个 Workers AI 模型。可在下拉里搜索，也可以直接在上方手动输入模型 ID。
                      </div>
                    </div>
                  ) : null}
                  {workersModelsWarning[target] ? (
                    <div className="mt-1 text-xs leading-5 text-[var(--editor-muted)]">{workersModelsWarning[target]}</div>
                  ) : null}
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--editor-ink)]">
                    文本模型配置
                  </label>
                  <Dropdown
                    options={[
                      { value: '', label: '未绑定' },
                      ...textProfileOptions,
                    ]}
                    value={String(item.text_profile_id || '')}
                    onChange={(value) => {
                      const nextId = value ? Number(value) : null
                      updateItem(target, { text_profile_id: nextId })
                    }}
                    placeholder="搜索并选择文本模型配置"
                  />
                </div>
              )}

              {isCover ? (
                null
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[var(--editor-ink)]">Temperature</label>
                    <input
                      type="number"
                      min={0}
                      max={2}
                      step={0.1}
                      value={item.temperature}
                      onChange={(event) => updateItem(target, { temperature: Number(event.target.value) })}
                      className="w-full rounded-xl border border-[var(--ui-line)] bg-[var(--ui-surface)] px-3 py-2.5 text-sm text-[var(--ui-ink)] outline-none focus:border-[var(--ui-accent)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[var(--editor-ink)]">Max Tokens</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={toNumericInput(item.max_tokens)}
                      onChange={(event) => {
                        const nextValue = Number(event.target.value.replace(/[^\d]/g, ''))
                        updateItem(target, { max_tokens: Number.isFinite(nextValue) && nextValue > 0 ? nextValue : 0 })
                      }}
                      className="w-full rounded-xl border border-[var(--ui-line)] bg-[var(--ui-surface)] px-3 py-2.5 text-sm text-[var(--ui-ink)] outline-none focus:border-[var(--ui-accent)]"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-[var(--editor-ink)]">默认提示词</label>
              <textarea
                rows={isCover ? 7 : 6}
                value={item.prompt}
                onChange={(event) => updateItem(target, { prompt: event.target.value })}
                className="w-full rounded-2xl border border-[var(--ui-line)] bg-[var(--ui-surface)] px-3 py-3 text-sm leading-6 text-[var(--ui-ink)] outline-none focus:border-[var(--ui-accent)]"
              />
            </div>

            <div className="mt-4 flex flex-col gap-3 text-xs text-[var(--editor-muted)] sm:flex-row sm:items-center sm:justify-between">
              <div>
                {target === 'slug'
                  ? 'slug 强制输出英文小写，保存时仍会再次规范化。'
                  : target === 'tags'
                    ? '标签会按数组解析并自动去重。'
                    : target === 'summary'
                      ? '摘要会截断到 160 字以内。'
                      : '封面会直接复用「图片模板 > 场景绑定 > 文章封面」这一套统一图片链路。'}
              </div>
              <button
                type="button"
                onClick={() => void saveItem(target)}
                disabled={savingTarget === target}
                className="inline-flex items-center justify-center rounded-xl bg-[var(--ui-accent)] px-4 py-2 text-sm font-semibold text-[var(--ui-accent-ink)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingTarget === target ? '保存中…' : '保存设置'}
              </button>
            </div>
          </section>
        )
      })}
    </div>
  )
}
