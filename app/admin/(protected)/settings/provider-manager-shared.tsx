'use client'

import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react'
import { ChevronDown } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import { Dropdown } from '@/components/Dropdown'
import { cx } from '@/components/ui/primitives'

export interface BaseProviderProfile {
  id: number
  name: string
  provider: string
  provider_name: string
  provider_type: string
  provider_category: string
  api_key_url: string
  base_url: string
  model: string
  api_key_masked: string
  is_default: number
  updated_at?: number
}

export interface BaseProviderFormState {
  id?: number
  name: string
  provider: string
  provider_name: string
  provider_type: string
  provider_category: string
  api_key_url: string
  base_url: string
  model: string
  api_key: string
  is_default: boolean
  api_key_masked?: string
}

function isPresetProvider(provider: string, presets?: Array<{ id: string }>) {
  if (!presets?.length) return false
  return presets.some((preset) => preset.id === provider)
}

export interface ModelsResponse {
  models?: Array<{ id: string; name: string }>
  source?: 'provider' | 'preset'
  warning?: string
  error?: string
}

export interface ProviderTemplatePreset {
  id: string
  name: string
  category: string
  defaultModel: string
  description: string
  recommended?: boolean
}

type ProviderTypeOption =
  | 'openai_compatible'
  | 'anthropic'
  | 'openai_images'

export interface ProviderTemplateGroup {
  category: string
  presets: ProviderTemplatePreset[]
}

export function createModelOptions(
  models: Array<{ id: string; name: string }>,
  currentModel: string,
) {
  const options = models.map((model) => ({ value: model.id, label: model.name }))
  const normalizedCurrentModel = currentModel.trim()

  if (!normalizedCurrentModel || options.some((option) => option.value === normalizedCurrentModel)) {
    return options
  }

  return [
    { value: normalizedCurrentModel, label: `${normalizedCurrentModel}（当前值）` },
    ...options,
  ]
}

interface ProviderListTableProps<T extends BaseProviderProfile> {
  profiles: T[]
  defaultProfileId: number | null
  emptyText: string
  onEdit: (profile: T) => void
  onDelete: (profile: T) => void
  onSetDefault: (profile: T) => void
}

export function ProviderListTable<T extends BaseProviderProfile>({
  profiles,
  defaultProfileId,
  emptyText,
  onEdit,
  onDelete,
  onSetDefault,
}: ProviderListTableProps<T>) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--editor-line)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--editor-soft)] text-left">
            <th className="px-3 py-2 font-medium text-[var(--editor-muted)]">名称</th>
            <th className="hidden px-3 py-2 font-medium text-[var(--editor-muted)] sm:table-cell">平台</th>
            <th className="hidden px-3 py-2 font-medium text-[var(--editor-muted)] md:table-cell">模型</th>
            <th className="hidden px-3 py-2 font-medium text-[var(--editor-muted)] lg:table-cell">更新时间</th>
            <th className="w-36 px-3 py-2 text-right font-medium text-[var(--editor-muted)]">操作</th>
          </tr>
        </thead>
        <tbody>
          {profiles.map((profile) => (
            <tr key={profile.id} className="border-t border-[var(--editor-line)] hover:bg-[var(--editor-panel)]">
              <td className="px-3 py-2 font-medium text-[var(--editor-ink)]">
                {profile.name}
                {profile.id === defaultProfileId || profile.is_default === 1 ? (
                  <span className="ml-2 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600">默认</span>
                ) : null}
              </td>
              <td className="hidden px-3 py-2 text-[var(--editor-muted)] sm:table-cell">
                {profile.provider_name || profile.provider || '-'}
              </td>
              <td className="hidden px-3 py-2 text-[var(--editor-muted)] md:table-cell">{profile.model}</td>
              <td className="hidden px-3 py-2 text-[var(--editor-muted)] lg:table-cell">
                {profile.updated_at ? new Date(profile.updated_at * 1000).toLocaleString('zh-CN') : '-'}
              </td>
              <td className="px-3 py-2 text-right">
                {profile.id !== defaultProfileId && profile.is_default !== 1 ? (
                  <button
                    type="button"
                    onClick={() => onSetDefault(profile)}
                    className="text-xs text-[var(--editor-accent)] hover:underline"
                  >
                    默认
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onEdit(profile)}
                  className="ml-2 text-xs text-[var(--editor-accent)] hover:underline"
                >
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(profile)}
                  className="ml-2 text-xs text-rose-500 hover:underline"
                >
                  删除
                </button>
              </td>
            </tr>
          ))}
          {profiles.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-sm text-[var(--editor-muted)]">
                {emptyText}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}

interface ProviderDialogProps {
  title: string
  onClose: () => void
  headerAction?: ReactNode
  children: ReactNode
}

export function ProviderDialog({ title, onClose, headerAction, children }: ProviderDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="mx-4 w-full max-w-2xl rounded-xl border border-[var(--editor-line)] bg-[var(--editor-panel)] p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[var(--editor-ink)]">{title}</h3>
          {headerAction}
        </div>
        {children}
      </div>
    </div>
  )
}

interface ProviderTemplateModalProps {
  groups: ProviderTemplateGroup[]
  customOptionLabel: string
  customOptionDescription: string
  onClose: () => void
  onSelect: (presetId: string) => void
}

export function ProviderTemplateModal({
  groups,
  customOptionLabel,
  customOptionDescription,
  onClose,
  onSelect,
}: ProviderTemplateModalProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="mx-4 w-full max-w-xl rounded-xl border border-[var(--editor-line)] bg-[var(--editor-panel)] p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-semibold text-[var(--editor-ink)]">快捷模板</h3>
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.category}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--editor-muted)]">
                {group.category}
              </div>
              <div className="space-y-2">
                {group.presets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onSelect(preset.id)}
                    className="w-full rounded-lg border border-[var(--editor-line)] px-4 py-3 text-left hover:bg-[var(--editor-soft)]"
                  >
                    <div className="text-sm font-semibold text-[var(--editor-ink)]">
                      {preset.name}
                      {preset.recommended ? (
                        <span className="ml-2 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600">推荐</span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-[var(--editor-muted)]">{preset.description}</div>
                    <div className="mt-1 text-xs text-[var(--editor-muted)]">{preset.defaultModel}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onSelect('custom')}
            className="w-full rounded-lg border border-dashed border-[var(--editor-line)] px-4 py-3 text-left hover:bg-[var(--editor-soft)]"
          >
            <div className="text-sm font-semibold text-[var(--editor-ink)]">{customOptionLabel}</div>
            <div className="mt-1 text-xs text-[var(--editor-muted)]">{customOptionDescription}</div>
          </button>
        </div>
      </div>
    </div>
  )
}

interface ProviderBasicFieldsProps<T extends BaseProviderFormState> {
  editing: T
  modelOptions: Array<{ value: string; label: string }>
  models: Array<{ id: string; name: string }>
  modelsSource: 'provider' | 'preset' | null
  modelsWarning: string
  modelsLoading?: boolean
  onChange: (patch: Partial<T>) => void
  presets?: Array<{
    id: string
    name: string
    providerType?: ProviderTypeOption
    baseUrl: string
    defaultModel: string
    apiKeyUrl?: string
    description?: string
  }>
  onClearModels?: () => void
  mode?: 'full' | 'text_simplified'
}

export function ProviderBasicFields<T extends BaseProviderFormState>({
  editing,
  modelOptions,
  models,
  modelsSource,
  modelsWarning,
  modelsLoading = false,
  onChange,
  presets,
  onClearModels,
  mode = 'full',
}: ProviderBasicFieldsProps<T>) {
  const presetProviderSelected = isPresetProvider(editing.provider, presets)
  const isCustomProvider = editing.provider === 'custom'
  const isSimplifiedTextMode = mode === 'text_simplified'
  const platformOptions = useMemo(() => {
    if (!presets) return []
    return [
      ...presets.map((preset) => ({ value: preset.id, label: preset.name })),
      { value: 'custom', label: '自定义兼容接口' },
    ]
  }, [presets])

  const providerTypeOptions = useMemo(() => ([
    { value: 'openai_compatible', label: 'OpenAI 兼容接口' },
    { value: 'anthropic', label: 'Anthropic 接口' },
  ]), [])

  const imageProviderTypeOptions = useMemo(() => ([
    { value: 'openai_images', label: 'OpenAI Images 接口' },
  ]), [])

  const activeProviderTypeOptions = editing.provider_type === 'openai_images'
    ? imageProviderTypeOptions
    : providerTypeOptions

  const showProviderTypeField = !isSimplifiedTextMode || isCustomProvider
  const showBaseUrlField = !isSimplifiedTextMode || isCustomProvider
  const showModelTextInput = !isSimplifiedTextMode || isCustomProvider || models.length === 0
  const modelHelperText = modelsLoading
    ? '正在拉取模型列表…'
    : models.length > 0
      ? `已加载 ${models.length} 个模型，可直接选择`
      : presetProviderSelected
        ? '填写 API Key 后会自动尝试拉取该平台可用模型，失败时回退到预设模型。'
        : ''

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--editor-ink)]">配置名称</label>
        <input
          type="text"
          value={editing.name}
          onChange={(event) => onChange({ name: event.target.value } as Partial<T>)}
          className="w-full rounded-lg border border-[var(--ui-line)] bg-[var(--ui-surface)] px-3 py-2 text-sm text-[var(--ui-ink)] outline-none focus:border-[var(--ui-accent)]"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--editor-ink)]">平台</label>
        {presets && presets.length > 0 ? (
          <Dropdown
            options={platformOptions}
            value={editing.provider}
            onChange={(val) => {
              if (val === 'custom') {
                onChange({
                  provider: 'custom',
                  provider_name: '自定义',
                  provider_type: 'openai_compatible',
                  base_url: '',
                  model: '',
                  api_key_url: '',
                } as Partial<T>)
              } else {
                const preset = presets.find((p) => p.id === val)
                if (preset) {
                  onChange({
                    provider: preset.id,
                    provider_name: preset.name,
                    provider_type: preset.providerType || 'openai_compatible',
                    base_url: preset.baseUrl,
                    model: preset.defaultModel,
                    api_key_url: preset.apiKeyUrl || '',
                    name: editing.name.trim() ? editing.name : preset.name,
                  } as Partial<T>)
                }
              }
              if (onClearModels) {
                onClearModels()
              }
            }}
          />
        ) : (
          <input
            type="text"
            value={editing.provider_name || editing.provider}
            onChange={(event) => onChange({ provider_name: event.target.value } as Partial<T>)}
            className="w-full rounded-lg border border-[var(--ui-line)] bg-[var(--ui-surface)] px-3 py-2 text-sm text-[var(--ui-ink)] outline-none focus:border-[var(--ui-accent)]"
          />
        )}
      </div>

      {showProviderTypeField ? (
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-[var(--editor-ink)]">接口类型</label>
          <Dropdown
            options={activeProviderTypeOptions}
            value={editing.provider_type || activeProviderTypeOptions[0]?.value || 'openai_compatible'}
            onChange={(value) => {
              if (presetProviderSelected) return
              onChange({ provider_type: value } as Partial<T>)
            }}
            disabled={presetProviderSelected}
          />
          {presetProviderSelected ? (
            <div className="mt-1 text-xs text-[var(--editor-muted)]">预设平台的接口类型已自动锁定，只有自定义兼容接口可手动修改。</div>
          ) : null}
        </div>
      ) : null}

      {showBaseUrlField ? (
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-[var(--editor-ink)]">Base URL</label>
          <input
            type="url"
            value={editing.base_url}
            onChange={(event) => onChange({ base_url: event.target.value } as Partial<T>)}
            className="w-full rounded-lg border border-[var(--ui-line)] bg-[var(--ui-surface)] px-3 py-2 text-sm text-[var(--ui-ink)] outline-none focus:border-[var(--ui-accent)]"
          />
        </div>
      ) : null}

      <div className="sm:col-span-2">
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="block text-sm font-medium text-[var(--editor-ink)]">API Key</label>
          {editing.api_key_url ? (
            <a
              href={editing.api_key_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--editor-accent)] hover:underline"
            >
              获取 Key
            </a>
          ) : null}
        </div>
        <input
          type="password"
          value={editing.api_key}
          onChange={(event) => onChange({ api_key: event.target.value } as Partial<T>)}
          className="w-full rounded-lg border border-[var(--ui-line)] bg-[var(--ui-surface)] px-3 py-2 text-sm text-[var(--ui-ink)] outline-none focus:border-[var(--ui-accent)]"
        />
        {editing.api_key_masked ? (
          <div className="mt-1 text-xs text-[var(--editor-muted)]">已保存：{editing.api_key_masked}</div>
        ) : null}
      </div>

      <div className="sm:col-span-2">
        <label className="mb-1 block text-sm font-medium text-[var(--editor-ink)]">模型</label>
        {models.length > 0 ? (
          <Dropdown
            options={modelOptions}
            value={editing.model}
            onChange={(value) => onChange({ model: value } as Partial<T>)}
            placeholder={modelsLoading ? '正在加载模型…' : `选择已加载的 ${models.length} 个模型`}
            disabled={modelsLoading}
          />
        ) : null}
        {showModelTextInput ? (
          <input
            type="text"
            value={editing.model}
            onChange={(event) => onChange({ model: event.target.value } as Partial<T>)}
            placeholder={isCustomProvider ? '输入模型名称' : '填写 API Key 后自动加载模型'}
            className={cx(
              'w-full rounded-lg border border-[var(--ui-line)] bg-[var(--ui-surface)] px-3 py-2 text-sm text-[var(--ui-ink)] outline-none focus:border-[var(--ui-accent)]',
              models.length > 0 ? 'mt-2' : '',
            )}
          />
        ) : null}
        {modelHelperText ? (
          <div className="mt-1 text-xs text-[var(--editor-muted)]">{modelHelperText}</div>
        ) : null}
        {modelsSource || modelsWarning ? (
          <div className="mt-1 text-xs text-[var(--editor-muted)]">
            {modelsSource === 'provider' ? '来源：服务商接口' : modelsSource === 'preset' ? '来源：模板回退' : ''}
            {modelsWarning ? ` · ${modelsWarning}` : ''}
          </div>
        ) : null}
      </div>

      {isSimplifiedTextMode && presetProviderSelected ? (
        <div className="sm:col-span-2">
          <Disclosure>
            {({ open }) => (
              <div className="rounded-xl border border-[var(--editor-line)] bg-[color-mix(in_srgb,var(--ui-bg)_88%,var(--ui-panel))]">
                <DisclosureButton className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left">
                  <div>
                    <div className="text-sm font-medium text-[var(--editor-ink)]">高级设置</div>
                    <div className="text-xs text-[var(--editor-muted)]">查看接口类型、Base URL 和其他可选项</div>
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
                    <label className="mb-1 block text-sm font-medium text-[var(--editor-ink)]">接口类型</label>
                    <div className="rounded-lg border border-[var(--ui-line)] bg-[var(--ui-surface)] px-3 py-2 text-sm text-[var(--ui-muted)]">
                      {editing.provider_type === 'anthropic' ? 'Anthropic 接口' : 'OpenAI 兼容接口'}
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-[var(--editor-ink)]">Base URL</label>
                    <div className="rounded-lg border border-[var(--ui-line)] bg-[var(--ui-surface)] px-3 py-2 text-sm text-[var(--ui-muted)]">
                      {editing.base_url || '-'}
                    </div>
                  </div>
                </DisclosurePanel>
              </div>
            )}
          </Disclosure>
        </div>
      ) : null}
    </div>
  )
}
