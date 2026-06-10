'use client'

import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react'
import { ChevronDown } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useToast } from '@/components/Toast'
import { Modal } from '@/components/Modal'
import { cx } from '@/components/ui/primitives'
import { AI_PROVIDER_PRESETS } from '@/lib/ai-provider-presets'
import { clampMaxTokens, clampTemperature, normalizeBaseUrl } from '@/lib/ai-provider-profiles'
import {
  createModelOptions,
  ProviderBasicFields,
  ProviderDialog,
  ProviderListTable,
  type BaseProviderFormState,
  type BaseProviderProfile,
  type ModelsResponse,
} from '@/app/admin/(protected)/settings/provider-manager-shared'

const CUSTOM_PROVIDER_ID = 'custom'

interface ProviderProfile extends BaseProviderProfile {
  temperature: number
  max_tokens: number
}

interface ProviderFormState extends BaseProviderFormState {
  id?: number
  temperature: number
  max_tokens: number
}

interface LoadedModel {
  id: string
  name: string
}

function createEmptyForm(): ProviderFormState {
  const deepseekPreset = AI_PROVIDER_PRESETS.find((preset) => preset.id === 'deepseek')

  return {
    name: deepseekPreset?.name || '',
    provider: deepseekPreset?.id || CUSTOM_PROVIDER_ID,
    provider_name: deepseekPreset?.name || '自定义',
    provider_type: deepseekPreset?.providerType || 'openai_compatible',
    provider_category: deepseekPreset?.category || '',
    api_key_url: deepseekPreset?.apiKeyUrl || '',
    base_url: deepseekPreset?.baseUrl || '',
    model: deepseekPreset?.defaultModel || '',
    temperature: 0,
    max_tokens: 0,
    api_key: '',
    is_default: false,
    api_key_masked: '',
  }
}

function mapProfileToForm(profile: ProviderProfile): ProviderFormState {
  return {
    id: profile.id,
    name: profile.name,
    provider: profile.provider,
    provider_name: profile.provider_name,
    provider_type: profile.provider_type,
    provider_category: profile.provider_category,
    api_key_url: profile.api_key_url,
    base_url: profile.base_url,
    model: profile.model,
    temperature: clampTemperature(Number(profile.temperature)),
    max_tokens: clampMaxTokens(Number(profile.max_tokens)),
    api_key: '',
    is_default: profile.is_default === 1,
    api_key_masked: profile.api_key_masked || '',
  }
}

export function AiProviderManager() {
  const toast = useToast()

  const [profiles, setProfiles] = useState<ProviderProfile[]>([])
  const [defaultProfileId, setDefaultProfileId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const [editing, setEditing] = useState<ProviderFormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [loadingModels, setLoadingModels] = useState(false)
  const [models, setModels] = useState<LoadedModel[]>([])
  const [modelsSource, setModelsSource] = useState<'provider' | 'preset' | null>(null)
  const [modelsWarning, setModelsWarning] = useState('')
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProviderProfile | null>(null)

  const loadProfiles = async () => {
    try {
      const res = await fetch('/api/admin/ai-provider')
      if (!res.ok) throw new Error('加载失败')
      const data = (await res.json()) as { profiles: ProviderProfile[]; default_profile_id?: number | null }
      setProfiles(data.profiles || [])
      setDefaultProfileId(typeof data.default_profile_id === 'number' ? data.default_profile_id : null)
    } catch {
      toast.error('加载 AI 配置失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadProfiles()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const resetModelState = () => {
    setModels([])
    setModelsSource(null)
    setModelsWarning('')
    setLoadingModels(false)
  }

  const openCreate = () => {
    setEditing(createEmptyForm())
    resetModelState()
    setTestResult(null)
  }

  const openEdit = (profile: ProviderProfile) => {
    setEditing(mapProfileToForm(profile))
    resetModelState()
    setTestResult(null)
  }

  const updateEditing = (patch: Partial<ProviderFormState>) => {
    setEditing((current) => (current ? { ...current, ...patch } : current))
  }

  const modelOptions = useMemo(
    () => createModelOptions(models, editing?.model || ''),
    [models, editing?.model],
  )

  useEffect(() => {
    if (!editing) return

    const preset = AI_PROVIDER_PRESETS.find((item) => item.id === editing.provider)
    const isCustomProvider = editing.provider === CUSTOM_PROVIDER_ID
    const hasInlineApiKey = Boolean(editing.api_key.trim())
    const canReuseStoredKey = Boolean(editing.id && editing.api_key_masked)

    if (isCustomProvider) {
      resetModelState()
      return
    }

    if (!preset) {
      resetModelState()
      return
    }

    if (!hasInlineApiKey && !canReuseStoredKey) {
      setModels(preset.quickModels.map((id) => ({ id, name: id })))
      setModelsSource('preset')
      setModelsWarning('填写 API Key 后会自动尝试拉取完整模型列表')
      setLoadingModels(false)
      return
    }

    const controller = new AbortController()
    const params = new URLSearchParams({
      provider: editing.provider,
      base_url: normalizeBaseUrl(editing.base_url),
      provider_type: editing.provider_type,
    })

    if (editing.id) {
      params.set('profile_id', String(editing.id))
    }
    if (hasInlineApiKey) {
      params.set('api_key', editing.api_key.trim())
    }

    setLoadingModels(true)

    void (async () => {
      try {
        const res = await fetch(`/api/admin/ai-provider/models?${params.toString()}`, {
          signal: controller.signal,
        })
        const data = (await res.json().catch(() => ({}))) as ModelsResponse
        if (!res.ok) {
          throw new Error(data.error || '获取模型列表失败')
        }

        const nextModels = (data.models || []).map((item) => ({
          id: item.id,
          name: item.name || item.id,
        }))

        setModels(nextModels)
        setModelsSource(data.source || null)
        setModelsWarning(data.warning || '')

        setEditing((current) => {
          if (!current || current.provider !== editing.provider) return current
          if (current.model.trim() || !nextModels[0]) return current
          return { ...current, model: nextModels[0].id }
        })
      } catch (error) {
        if (controller.signal.aborted) return
        setModels(preset.quickModels.map((id) => ({ id, name: id })))
        setModelsSource('preset')
        setModelsWarning(error instanceof Error ? error.message : '获取模型列表失败，已回退预设模型')
      } finally {
        if (!controller.signal.aborted) {
          setLoadingModels(false)
        }
      }
    })()

    return () => controller.abort()
  }, [editing])

  const handleTest = async () => {
    if (!editing) return

    if (!editing.model.trim()) {
      toast.error('请先选择或填写模型')
      return
    }

    setTesting(true)
    setTestResult(null)

    try {
      const payload: Record<string, unknown> = {
        base_url: normalizeBaseUrl(editing.base_url),
        model: editing.model.trim(),
        provider_type: editing.provider_type,
      }

      if (editing.temperature > 0) {
        payload.temperature = clampTemperature(editing.temperature)
      }
      if (editing.max_tokens > 0) {
        payload.max_tokens = Math.min(clampMaxTokens(editing.max_tokens), 256)
      }
      if (editing.id) payload.profile_id = editing.id
      if (editing.api_key.trim()) payload.api_key = editing.api_key.trim()

      const res = await fetch('/api/admin/ai-provider/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = (await res.json()) as { success: boolean; latency_ms?: number; model?: string; error?: string }
      if (data.success) {
        setTestResult({ success: true, message: `连接成功（${data.model} · ${data.latency_ms}ms）` })
      } else {
        setTestResult({ success: false, message: data.error || '测试失败' })
      }
    } catch {
      setTestResult({ success: false, message: '网络错误' })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    if (!editing) return

    if (!editing.name.trim() || !editing.model.trim()) {
      toast.error('请填写名称和模型')
      return
    }

    setSaving(true)

    try {
      const payload: Record<string, unknown> = {
        name: editing.name.trim(),
        provider: editing.provider,
        provider_name: editing.provider_name,
        provider_type: editing.provider_type,
        provider_category: editing.provider_category,
        api_key_url: editing.api_key_url,
        base_url: normalizeBaseUrl(editing.base_url),
        model: editing.model.trim(),
        is_default: editing.is_default,
      }

      if (editing.temperature > 0) {
        payload.temperature = clampTemperature(editing.temperature)
      }
      if (editing.max_tokens > 0) {
        payload.max_tokens = clampMaxTokens(editing.max_tokens)
      }
      if (editing.id) payload.id = editing.id
      if (editing.api_key.trim()) payload.api_key = editing.api_key.trim()

      const res = await fetch('/api/admin/ai-provider', {
        method: editing.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) throw new Error(data.error || '保存失败')

      toast.success('配置已保存')
      setEditing(null)
      resetModelState()
      await loadProfiles()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return

    try {
      const res = await fetch('/api/admin/ai-provider', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteTarget.id }),
      })
      const data = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) throw new Error(data.error || '删除失败')

      toast.success('配置已删除')
      setDeleteTarget(null)
      await loadProfiles()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除失败')
    }
  }

  const setAsDefault = async (profile: ProviderProfile) => {
    if (profile.is_default === 1) return

    try {
      const res = await fetch('/api/admin/ai-provider', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: profile.id,
          name: profile.name,
          provider: profile.provider,
          provider_name: profile.provider_name,
          provider_type: profile.provider_type,
          provider_category: profile.provider_category,
          api_key_url: profile.api_key_url,
          base_url: profile.base_url,
          model: profile.model,
          temperature: profile.temperature,
          max_tokens: profile.max_tokens,
          is_default: true,
        }),
      })
      const data = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) throw new Error(data.error || '设置默认失败')

      toast.success('已设置为默认配置')
      await loadProfiles()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '设置默认失败')
    }
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-[var(--editor-muted)]">加载中…</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-[var(--editor-ink)]">文本模型配置</h3>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-[var(--editor-accent)] px-3 py-1.5 text-sm font-semibold text-white transition hover:brightness-105"
        >
          + 新增配置
        </button>
      </div>

      <ProviderListTable
        profiles={profiles}
        defaultProfileId={defaultProfileId}
        emptyText="暂无配置"
        onEdit={openEdit}
        onDelete={setDeleteTarget}
        onSetDefault={setAsDefault}
      />

      {editing && (
        <ProviderDialog
          title={editing.id ? '编辑文本模型配置' : '新增文本模型配置'}
          onClose={() => setEditing(null)}
        >
          <ProviderBasicFields
            editing={editing}
            modelOptions={modelOptions}
            models={models}
            modelsSource={modelsSource}
            modelsWarning={modelsWarning}
            modelsLoading={loadingModels}
            onChange={updateEditing}
            presets={AI_PROVIDER_PRESETS}
            mode="text_simplified"
            onClearModels={resetModelState}
          />

          <div className="mt-3 space-y-3">
            <label className="inline-flex items-center gap-2 text-sm text-[var(--editor-ink)]">
              <input
                type="checkbox"
                checked={editing.is_default}
                onChange={(event) => updateEditing({ is_default: event.target.checked })}
              />
              保存为默认配置
            </label>

            <Disclosure>
              {({ open }) => (
                <div className="rounded-xl border border-[var(--editor-line)] bg-[color-mix(in_srgb,var(--ui-bg)_88%,var(--ui-panel))]">
                  <DisclosureButton className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left">
                    <div>
                      <div className="text-sm font-medium text-[var(--editor-ink)]">可选参数</div>
                      <div className="text-xs text-[var(--editor-muted)]">Temperature 和 Max Tokens 默认可留空</div>
                    </div>
                    <ChevronDown
                      className={cx(
                        'h-4 w-4 shrink-0 text-[var(--editor-muted)] transition-transform duration-150',
                        open ? 'rotate-180' : '',
                      )}
                    />
                  </DisclosureButton>
                  <DisclosurePanel className="grid grid-cols-1 gap-3 border-t border-[var(--editor-line)] px-3 pb-3 pt-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-[var(--editor-ink)]">Temperature</label>
                      <input
                        type="number"
                        min={0}
                        max={2}
                        step={0.1}
                        placeholder="默认"
                        value={editing.temperature > 0 ? String(editing.temperature) : ''}
                        onChange={(event) => {
                          const value = event.target.value.trim()
                          updateEditing({ temperature: value ? clampTemperature(Number(value)) : 0 })
                        }}
                        className="w-full rounded-lg border border-[var(--ui-line)] bg-[var(--ui-surface)] px-3 py-2 text-sm text-[var(--ui-ink)] outline-none focus:border-[var(--ui-accent)]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-[var(--editor-ink)]">Max Tokens</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="默认"
                        value={editing.max_tokens > 0 ? String(editing.max_tokens) : ''}
                        onChange={(event) => {
                          const digits = event.target.value.replace(/[^\d]/g, '')
                          updateEditing({ max_tokens: digits ? clampMaxTokens(Number(digits)) : 0 })
                        }}
                        className="w-full rounded-lg border border-[var(--ui-line)] bg-[var(--ui-surface)] px-3 py-2 text-sm text-[var(--ui-ink)] outline-none focus:border-[var(--ui-accent)]"
                      />
                    </div>
                  </DisclosurePanel>
                </div>
              )}
            </Disclosure>
          </div>

          {testResult ? (
            <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${testResult.success ? 'border-[color-mix(in_srgb,var(--ui-success)_32%,transparent)] bg-[color-mix(in_srgb,var(--ui-success)_12%,transparent)] text-[var(--ui-ink)]' : 'border-[color-mix(in_srgb,var(--ui-danger)_32%,transparent)] bg-[color-mix(in_srgb,var(--ui-danger)_12%,transparent)] text-[var(--ui-ink)]'}`}>
              {testResult.success ? '✅ ' : '❌ '}
              {testResult.message}
            </div>
          ) : null}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="rounded-lg border border-[var(--editor-line)] px-4 py-2 text-sm text-[var(--editor-ink)] hover:bg-[var(--editor-soft)] disabled:opacity-50"
            >
              {testing ? '测试中…' : '测试连接'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-lg border border-[var(--editor-line)] px-4 py-2 text-sm text-[var(--editor-ink)] hover:bg-[var(--editor-soft)]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-[var(--ui-accent)] px-4 py-2 text-sm font-semibold text-[var(--ui-accent-ink)] hover:brightness-105 disabled:opacity-50"
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </ProviderDialog>
      )}

      {deleteTarget && (
        <Modal
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          title="确认删除"
          description={`确定要删除配置「${deleteTarget.name}」吗？`}
          confirmText="删除"
          type="danger"
        />
      )}
    </div>
  )
}
