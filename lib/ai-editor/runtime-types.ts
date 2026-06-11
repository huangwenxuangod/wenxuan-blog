import type { AIEnv } from '@/lib/ai'
import type { AiEditorContext, AiEditorMemoryItem, AiEditorMemoryWrite, AiEditorThreadMessage } from '@/lib/ai-editor/types'
import type { AiEditorToolCall } from '@/lib/ai-editor/tool-registry'
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
  | { type: 'create_post'; slug: string; title: string; postId?: number; category?: string; status?: 'draft' | 'published' }
  | { type: 'update_post'; slug: string; title?: string; changedFields: string[] }
  | { type: 'edit_title'; title: string }
  | { type: 'edit_selection'; markdown: string; blockIndex?: number }
  | { type: 'insert_block'; anchorBlockIndex?: number; position?: 'before' | 'after' | 'end'; markdown: string }
  | {
      type: 'generate_images'
      images: Array<{
        prompt: string
        usage: 'inline' | 'cover'
        anchorBlockIndex?: number
        sourceBlockIndex?: number
        sourceHeadingPath?: string[]
        generationReason?: string
        visualRole?: string
        styleFingerprint?: string
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
  appEnv?: CloudflareEnv | null
}

export interface EditorAiRuntimeResult {
  taskType: EditorAiTaskType
  context: AiEditorContext
  stream: AsyncIterable<EditorAiRuntimeEvent>
  completed: Promise<EditorAiRuntimeCompletedResult>
}

export interface EditorAiRuntimePreparedInput extends EditorAiRuntimeInput {
  context: AiEditorContext
  agentState?: WorkspaceAgentState | null
  toolObservations?: EditorAiToolObservation[]
}

export interface EditorAiModelPrompt {
  systemPrompt: string
  userPrompt: string
}

export interface EditorAiProviderPlanResult {
  message: string
  toolCall: AiEditorToolCall
  error?: string
}

export interface EditorAiProviderPlanExecution {
  completed: Promise<EditorAiProviderPlanResult>
  stream?: AsyncIterable<string>
}

export interface EditorAiRuntimeCompletedResult {
  message: string
  action: EditorAiAction
  memoryCandidates: AiEditorMemoryWrite[]
  error?: string
}

export type WorkspaceAgentIntent =
  | 'reply'
  | 'edit_current_post'
  | 'create_new_post'
  | 'update_existing_post'
  | 'research_then_create'
  | 'research_then_update'
  | 'generate_images'

export interface WorkspaceAgentState {
  goal: string
  intent: WorkspaceAgentIntent
  iteration: number
  maxIterations: number
  currentPostSlug: string | null
  workingSet: Array<{
    slug: string
    title: string
    reason: string
  }>
  observations: string[]
  pendingAction: string | null
  completed: boolean
  completionReason: string | null
}

export interface EditorAiToolObservation {
  toolName: string
  summary: string
  payload?: Record<string, unknown> | null
}
