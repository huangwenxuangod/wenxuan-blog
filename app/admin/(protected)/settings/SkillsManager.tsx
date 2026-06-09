'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Archive, Loader2, Trash2, Upload } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { UiButton, UiIconButton, UiPanel } from '@/components/ui/primitives'

interface SkillSummary {
  id: number
  name: string
  description: string
  version: string
  contentHash: string
  fileCount: number
  enabled: boolean
}

async function readError(response: Response, fallback: string) {
  const data = await response.json().catch(() => ({})) as {
    error?: string | { message?: string }
  }
  if (typeof data.error === 'string') return data.error
  return data.error?.message || fallback
}

export function SkillsManager() {
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [skills, setSkills] = useState<SkillSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SkillSummary | null>(null)

  const loadSkills = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/skills')
      if (!response.ok) throw new Error(await readError(response, '读取 Skills 失败'))
      const data = await response.json() as { skills?: SkillSummary[] }
      setSkills(data.skills || [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '读取 Skills 失败')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void loadSkills()
  }, [loadSkills])

  const uploadSkill = async (file: File) => {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.set('file', file)
      const response = await fetch('/api/admin/skills', {
        method: 'POST',
        body: formData,
      })
      if (!response.ok) throw new Error(await readError(response, '安装 Skill 失败'))
      toast.success('Skill 已安装')
      await loadSkills()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '安装 Skill 失败')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const toggleSkill = async (skill: SkillSummary) => {
    try {
      const response = await fetch(`/api/admin/skills/${skill.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !skill.enabled }),
      })
      if (!response.ok) throw new Error(await readError(response, '更新 Skill 失败'))
      setSkills((current) => current.map((item) => (
        item.id === skill.id ? { ...item, enabled: !item.enabled } : item
      )))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '更新 Skill 失败')
    }
  }

  const deleteSkill = async () => {
    if (!deleteTarget) return false
    try {
      const response = await fetch(`/api/admin/skills/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error(await readError(response, '删除 Skill 失败'))
      toast.success('Skill 已删除')
      setDeleteTarget(null)
      await loadSkills()
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除 Skill 失败')
      return false
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[var(--editor-ink)]">Skills</h3>
          <p className="mt-1 text-sm text-[var(--editor-muted)]">
            上传符合 Agent Skills 规范的 ZIP 包，编辑器中按需挂载一个 Skill。
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void uploadSkill(file)
          }}
        />
        <UiButton
          tone="solid"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? '安装中' : '安装 ZIP'}
        </UiButton>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-[var(--editor-muted)]">加载中…</div>
      ) : skills.length === 0 ? (
        <UiPanel className="flex min-h-40 flex-col items-center justify-center px-6 text-center">
          <Archive className="mb-3 h-5 w-5 text-[var(--editor-muted)]" />
          <p className="text-sm text-[var(--editor-ink)]">还没有安装 Skill</p>
          <p className="mt-1 text-xs text-[var(--editor-muted)]">ZIP 内必须包含唯一的 SKILL.md。</p>
        </UiPanel>
      ) : (
        <div className="divide-y divide-[var(--editor-line)] border-y border-[var(--editor-line)]">
          {skills.map((skill) => (
            <div key={skill.id} className="flex items-center gap-4 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-[var(--editor-ink)]">{skill.name}</span>
                  <span className="text-xs text-[var(--editor-muted)]">v{skill.version}</span>
                  <span className="text-xs text-[var(--editor-muted)]">{skill.fileCount} 个文件</span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--editor-muted)]">
                  {skill.description}
                </p>
                <p className="mt-1 font-mono text-[11px] text-[color-mix(in_srgb,var(--editor-muted)_72%,transparent)]">
                  sha256:{skill.contentHash.slice(0, 12)}
                </p>
              </div>
              <UiButton
                tone={skill.enabled ? 'soft' : 'quiet'}
                size="sm"
                onClick={() => void toggleSkill(skill)}
              >
                {skill.enabled ? '已启用' : '已禁用'}
              </UiButton>
              <UiIconButton
                tone="danger"
                size="sm"
                aria-label={`删除 ${skill.name}`}
                onClick={() => setDeleteTarget(skill)}
              >
                <Trash2 className="h-4 w-4" />
              </UiIconButton>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteSkill}
        closeOnConfirm={false}
        title="删除 Skill"
        description={`确定删除「${deleteTarget?.name || ''}」及其 R2 文件吗？`}
        confirmText="删除"
        type="danger"
      />
    </div>
  )
}
