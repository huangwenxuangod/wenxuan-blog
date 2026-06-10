import type { AIEnv } from '@/lib/ai'
import type { AiEditorContext, AiEditorMemoryItem, AiEditorMemoryWrite, AiEditorThreadMessage } from '@/lib/ai-editor/types'
import type { ActiveSkillInstructions } from '@/lib/skills/prompt'

export type EditorAiTaskType =
  | 'chat'
  | 'rewrite'
  | 'expand'
  | 'compress'
  | 'outline_fix'
  | 'image_plan'
  | 'image_generate'
  | 'image_insert'

export type EditorAiAction =
  | { type: 'reply_only' }
  | { type: 'edit_title'; title: string }
  | { type: 'edit_selection'; markdown: string; blockIndex?: number }
  | { type: 'insert_block'; anchorBlockIndex?: number; position?: 'before' | 'after' | 'end'; markdown: string }
  | {
      type: 'generate_images'
      images: Array<{
        prompt: string
        usage: 'inline' | 'cover'
        anchorBlockIndex?: number
        alt?: string
        aspectRatio?: string
        resolution?: string
        imageProfileId?: number | null
      }>
    }

export type EditorAiRuntimeEvent =
  | { type: 'assistant_start' }
  | { type: 'assistant_delta'; delta: string }
  | { type: 'tool_pending'; tool: string; payload?: unknown }
  | { type: 'tool_result'; tool: string; payload?: unknown }
  | { type: 'action_ready'; action: EditorAiAction }
  | { type: 'assistant_done'; message: string; action?: EditorAiAction | null; error?: string }
  | { type: 'assistant_error'; error: string }

export interface EditorAiRuntimeInput {
  articleKey: string
  userMessage: string
  title: string
  postSlug?: string | null
  documentText: string
  documentJson?: unknown
  activeBlockIndex?: number | null
  selectionText?: string | null
  history: AiEditorThreadMessage[]
  memoryItems: AiEditorMemoryItem[]
  userSummary?: string | null
  articleSummary?: string | null
  sessionSummary?: string | null
  activeSkill?: ActiveSkillInstructions | null
  textProfileId?: number | null
  imageProfileId?: number | null
  env?: AIEnv
  db?: D1Database
}

export interface EditorAiRuntimeResult {
  taskType: EditorAiTaskType
  context: AiEditorContext
  stream: AsyncIterable<EditorAiRuntimeEvent>
  completed: Promise<EditorAiRuntimeCompletedResult>
}

export interface EditorAiRuntimePreparedInput extends EditorAiRuntimeInput {
  context: AiEditorContext
}

export interface EditorAiModelPrompt {
  systemPrompt: string
  userPrompt: string
}

export interface EditorAiProviderRunResult {
  message: string
  action: EditorAiAction
  error?: string
}

export interface EditorAiProviderStreamResult {
  stream: AsyncIterable<EditorAiRuntimeEvent>
  completed: Promise<EditorAiProviderRunResult>
}

export interface EditorAiRuntimeCompletedResult {
  message: string
  action: EditorAiAction
  memoryCandidates: AiEditorMemoryWrite[]
  error?: string
}
