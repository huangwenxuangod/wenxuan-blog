import { normalizeToolCallToAction, convertActionToLegacyTool } from '@/lib/ai-editor/action-schema'
import { buildAiEditorContext } from '@/lib/ai-editor/context'
import { deriveAiEditorMemoryCandidates } from '@/lib/ai-editor/memory'
import { planEditorAiStep } from '@/lib/ai-editor/provider'
import { classifyEditorAiTask } from '@/lib/ai-editor/task-classifier'
import { chunkAssistantMessage } from '@/lib/ai-editor/prompt-builder'
import {
  executeCreatePostTool,
  executeGetPostTool,
  executeListPostsTool,
  executeSearchPostsTool,
  executeUpdatePostTool,
} from '@/lib/ai-editor/workspace-tools'
import {
  isClientEditorTool,
  isLookupTool,
  isWorkspaceMutationTool,
  normalizeAiEditorToolCall,
  type AiEditorToolCall,
  type CanonicalEditorToolName,
  type CreatePostToolPayload,
  type GetPostToolPayload,
  type ListPostsToolPayload,
  type SearchPostsToolPayload,
  type UpdatePostToolPayload,
} from '@/lib/ai-editor/tool-registry'
import type {
  EditorAiAction,
  EditorAiRuntimeCompletedResult,
  EditorAiRuntimeInput,
  EditorAiRuntimePreparedInput,
  EditorAiRuntimeResult,
  EditorAiToolObservation,
  WorkspaceAgentState,
  WorkspaceAgentIntent,
} from '@/lib/ai-editor/runtime-types'
import type { AiEditorMemoryItem } from '@/lib/ai-editor/types'

const MAX_TOOL_OBSERVATIONS = 8
const MAX_LOOKUP_POSTS = 3
const MAX_ITERATIONS = 4
const MAX_GET_POST_CALLS = 3
const RECENT_COMPLETED_ACTION_LIMIT = 3

function appendObservation(
  current: EditorAiToolObservation[],
  observation: EditorAiToolObservation,
) {
  return [...current, observation].slice(-MAX_TOOL_OBSERVATIONS)
}

function mergeWorkingSet(
  current: WorkspaceAgentState['workingSet'],
  updates: WorkspaceAgentState['workingSet'],
) {
  if (updates.length === 0) return current

  const next = [...current]
  const indexBySlug = new Map(next.map((item, index) => [item.slug, index]))

  for (const item of updates) {
    const existingIndex = indexBySlug.get(item.slug)
    if (existingIndex === undefined) {
      indexBySlug.set(item.slug, next.length)
      next.push(item)
      continue
    }

    next[existingIndex] = item
  }

  return next.slice(-MAX_LOOKUP_POSTS)
}

function prepareEditorAiRuntimeInput(input: EditorAiRuntimeInput): EditorAiRuntimePreparedInput {
  const context = buildAiEditorContext({
    title: input.title,
    documentText: input.documentText,
    documentJson: (input.documentJson as never) || null,
    postSlug: input.postSlug,
    userMessage: input.userMessage,
    history: input.history,
    memoryItems: input.memoryItems,
    activeBlockIndex: input.activeBlockIndex,
    selectionText: input.selectionText,
  })

  return {
    ...input,
    context,
  }
}

function mapTaskTypeToIntent(taskType: ReturnType<typeof classifyEditorAiTask>): WorkspaceAgentIntent {
  if (taskType === 'image_generate' || taskType === 'image_insert' || taskType === 'image_plan') {
    return 'generate_images'
  }

  if (taskType === 'rewrite' || taskType === 'expand' || taskType === 'compress' || taskType === 'outline_fix') {
    return 'edit_current_post'
  }

  return 'reply'
}

function initializeAgentState(prepared: EditorAiRuntimePreparedInput): WorkspaceAgentState {
  const taskType = classifyEditorAiTask(prepared)
  return {
    goal: prepared.userMessage.trim(),
    intent: mapTaskTypeToIntent(taskType),
    iteration: 0,
    maxIterations: MAX_ITERATIONS,
    currentPostSlug: prepared.postSlug || null,
    workingSet: [],
    observations: [],
    pendingAction: null,
    completed: false,
    completionReason: null,
  }
}

function summarizeLookupPosts(
  toolName: CanonicalEditorToolName,
  posts: Array<{ slug: string; title: string; excerpt?: string }>,
) {
  if (posts.length === 0) {
    return `${toolName} 没有返回文章`
  }

  return `${toolName} 返回 ${posts.length} 篇：${posts
    .slice(0, MAX_LOOKUP_POSTS)
    .map((post) => `${post.slug} (${post.title})`)
    .join('；')}`
}

function normalizePlannedToolCall(rawTool: AiEditorToolCall | null | undefined): AiEditorToolCall {
  return normalizeAiEditorToolCall(rawTool)
}

function createCompletedResult(
  prepared: EditorAiRuntimePreparedInput,
  message: string,
  action: EditorAiAction,
): EditorAiRuntimeCompletedResult {
  return {
    message,
    action,
    memoryCandidates: deriveAiEditorMemoryCandidates({
      userMessage: prepared.userMessage,
      assistantMessage: message,
      tool: convertActionToLegacyTool(action) as { name: string; payload?: Record<string, unknown> | null },
    }),
  }
}

function getToolSignature(toolCall: AiEditorToolCall) {
  return JSON.stringify({
    name: toolCall.name,
    payload: toolCall.payload || null,
  })
}

function normalizeTextValue(value: string | null | undefined) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function normalizeImageTaskSignature(
  images: Extract<EditorAiAction, { type: 'generate_images' }>['images'],
) {
  return images
    .map((image) => ({
      prompt: normalizeTextValue(image.prompt).toLowerCase(),
      usage: image.usage,
      anchorBlockIndex: typeof image.anchorBlockIndex === 'number' ? image.anchorBlockIndex : null,
      sourceBlockIndex: typeof image.sourceBlockIndex === 'number' ? image.sourceBlockIndex : null,
      sourceHeadingPath: Array.isArray(image.sourceHeadingPath)
        ? image.sourceHeadingPath.map((item) => normalizeTextValue(item))
        : [],
      styleFingerprint: normalizeTextValue(image.styleFingerprint),
      visualRole: normalizeTextValue(image.visualRole),
      aspectRatio: normalizeTextValue(image.aspectRatio),
      resolution: normalizeTextValue(image.resolution),
      alt: normalizeTextValue(image.alt),
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
}

function buildClientActionSignature(action: EditorAiAction) {
  if (action.type === 'reply_only' || action.type === 'create_post' || action.type === 'update_post') {
    return null
  }

  if (action.type === 'edit_title') {
    return JSON.stringify({
      type: action.type,
      title: normalizeTextValue(action.title),
    })
  }

  if (action.type === 'edit_selection') {
    return JSON.stringify({
      type: action.type,
      blockIndex: typeof action.blockIndex === 'number' ? action.blockIndex : null,
      markdown: normalizeTextValue(action.markdown),
    })
  }

  if (action.type === 'insert_block') {
    return JSON.stringify({
      type: action.type,
      anchorBlockIndex: typeof action.anchorBlockIndex === 'number' ? action.anchorBlockIndex : null,
      position: action.position || 'end',
      markdown: normalizeTextValue(action.markdown),
    })
  }

  return JSON.stringify({
    type: action.type,
    images: normalizeImageTaskSignature(action.images),
  })
}

function getRecentCompletedClientActionSignatures(memoryItems: AiEditorMemoryItem[]) {
  const signatures = new Set<string>()
  const completedItems = memoryItems
    .filter((item) => !item.archived && item.kind === 'completed_task')
    .slice(0, RECENT_COMPLETED_ACTION_LIMIT)

  for (const item of completedItems) {
    const payload = item.payload && typeof item.payload === 'object'
      ? item.payload as Record<string, unknown>
      : null
    const toolName = typeof payload?.toolName === 'string' ? payload.toolName : ''
    const toolPayload = payload && 'toolPayload' in payload && payload.toolPayload && typeof payload.toolPayload === 'object'
      ? payload.toolPayload as Record<string, unknown>
      : null
    if (!toolName) continue

    const action = normalizeToolCallToAction(normalizeAiEditorToolCall({
      name: toolName,
      payload: toolPayload,
    }))
    const signature = buildClientActionSignature(action)
    if (signature) {
      signatures.add(signature)
    }
  }

  return signatures
}

function hasExplicitSlugMention(userMessage: string, slug: string) {
  const normalizedSlug = normalizeTextValue(slug)
  if (!normalizedSlug) return false
  return normalizeTextValue(userMessage).toLowerCase().includes(normalizedSlug.toLowerCase())
}

function canSafelyUpdateTargetPost(input: {
  targetSlug: string
  currentOpenPostSlug?: string | null
  userMessage: string
  lookedUpPostSlugs: Set<string>
}) {
  const targetSlug = normalizeTextValue(input.targetSlug)
  if (!targetSlug) return false

  if (normalizeTextValue(input.currentOpenPostSlug || '') === targetSlug) {
    return true
  }

  if (hasExplicitSlugMention(input.userMessage, targetSlug)) {
    return true
  }

  return input.lookedUpPostSlugs.has(targetSlug)
}

async function executeLookupTool(
  db: D1Database,
  toolCall: AiEditorToolCall,
) {
  if (toolCall.name === 'list_posts') {
    const result = await executeListPostsTool(db, (toolCall.payload || {}) as ListPostsToolPayload)
    return {
      payload: result,
      observation: {
        toolName: toolCall.name,
        summary: summarizeLookupPosts(toolCall.name, result.posts),
        payload: { posts: result.posts.slice(0, MAX_LOOKUP_POSTS) },
      } satisfies EditorAiToolObservation,
      workingSetUpdates: result.posts.slice(0, MAX_LOOKUP_POSTS).map((post) => ({
        slug: post.slug,
        title: post.title,
        reason: 'list_posts',
      })),
    }
  }

  if (toolCall.name === 'search_posts') {
    const result = await executeSearchPostsTool(db, toolCall.payload as SearchPostsToolPayload)
    return {
      payload: result,
      observation: {
        toolName: toolCall.name,
        summary: summarizeLookupPosts(toolCall.name, result.posts),
        payload: { posts: result.posts.slice(0, MAX_LOOKUP_POSTS) },
      } satisfies EditorAiToolObservation,
      workingSetUpdates: result.posts.slice(0, MAX_LOOKUP_POSTS).map((post) => ({
        slug: post.slug,
        title: post.title,
        reason: 'search_posts',
      })),
    }
  }

  const result = await executeGetPostTool(db, toolCall.payload as GetPostToolPayload)
  return {
    payload: result,
    observation: {
      toolName: toolCall.name,
      summary: `get_post 读取了 ${result.post.slug}，标题为《${result.post.title}》`,
      payload: {
        post: {
          slug: result.post.slug,
          title: result.post.title,
          category: result.post.category,
          description: result.post.description,
          content: result.post.content,
          tags: result.post.tags,
          status: result.post.status,
        },
      },
    } satisfies EditorAiToolObservation,
    workingSetUpdates: [{
      slug: result.post.slug,
      title: result.post.title,
      reason: 'get_post',
    }],
  }
}

export async function runEditorAiRuntime(input: EditorAiRuntimeInput): Promise<EditorAiRuntimeResult> {
  const prepared = prepareEditorAiRuntimeInput(input)
  const taskType = classifyEditorAiTask(prepared)
  const agentState = initializeAgentState(prepared)
  const recentCompletedClientActionSignatures = getRecentCompletedClientActionSignatures(input.memoryItems)

  let resolveCompleted!: (value: EditorAiRuntimeCompletedResult) => void
  let rejectCompleted!: (reason?: unknown) => void

  const completed = new Promise<EditorAiRuntimeCompletedResult>((resolve, reject) => {
    resolveCompleted = resolve
    rejectCompleted = reject
  })

  const stream = (async function* () {
    try {
      yield { type: 'assistant_start' as const }

      let observations: EditorAiToolObservation[] = []
      let finalAction: EditorAiAction | null = null
      let finalMessage = ''
      let streamedAssistantMessage = ''
      const toolUsageCounts = new Map<CanonicalEditorToolName, number>()
      const lookedUpPostSlugs = new Set<string>()
      const lookupCache = new Map<string, {
        payload: unknown
        observation: EditorAiToolObservation
        workingSetUpdates: WorkspaceAgentState['workingSet']
      }>()

      for (let iteration = 1; iteration <= agentState.maxIterations; iteration += 1) {
        agentState.iteration = iteration

        const planExecution = await planEditorAiStep({
          ...prepared,
          agentState,
          toolObservations: observations,
        })
        let iterationStreamedMessage = ''

        if (planExecution.stream) {
          let shouldInsertSeparator = streamedAssistantMessage.trim().length > 0

          for await (const delta of planExecution.stream) {
            const normalizedDelta = delta || ''
            if (!normalizedDelta) continue

            if (shouldInsertSeparator) {
              shouldInsertSeparator = false
              streamedAssistantMessage += '\n\n'
              yield {
                type: 'assistant_delta' as const,
                delta: '\n\n',
              }
            }

            iterationStreamedMessage += normalizedDelta
            streamedAssistantMessage += normalizedDelta
            yield {
              type: 'assistant_delta' as const,
              delta: normalizedDelta,
            }
          }
        }

        const plan = await planExecution.completed

        if (!iterationStreamedMessage.trim() && !streamedAssistantMessage.trim() && plan.message.trim()) {
          // Keep non-stream providers on the old path and emit at the end only.
        }

        const plannedTool = normalizePlannedToolCall(plan.toolCall)
        agentState.pendingAction = plannedTool.name

        if (plannedTool.name === 'reply_only') {
          finalAction = { type: 'reply_only' }
          finalMessage = plan.message
          break
        }

        if (isLookupTool(plannedTool.name)) {
          if (!prepared.db) {
            throw new Error('DB unavailable for lookup tool execution')
          }

          const signature = getToolSignature(plannedTool)
          const currentCount = toolUsageCounts.get(plannedTool.name) || 0

          if (plannedTool.name === 'get_post' && currentCount >= MAX_GET_POST_CALLS) {
            observations = appendObservation(observations, {
              toolName: plannedTool.name,
              summary: 'guardrail: 本轮 get_post 已达到 3 次上限，请直接基于已有读取结果收敛为最终回复或最终动作。',
              payload: { limit: MAX_GET_POST_CALLS },
            })
            agentState.observations = observations.map((item) => item.summary)
            continue
          }

          if (lookupCache.has(signature)) {
            observations = appendObservation(observations, {
              toolName: plannedTool.name,
              summary: `guardrail: ${plannedTool.name} 相同参数已经执行过一次，不要重复读取，直接使用现有结果继续。`,
              payload: { repeatedSignature: signature },
            })
            agentState.observations = observations.map((item) => item.summary)
            continue
          }

          yield {
            type: 'tool_pending' as const,
            tool: plannedTool.name,
            payload: plannedTool.payload || null,
          }

          const lookupResult = await executeLookupTool(prepared.db, plannedTool)
          lookupCache.set(signature, lookupResult)
          toolUsageCounts.set(plannedTool.name, currentCount + 1)

          observations = appendObservation(observations, lookupResult.observation)

          agentState.observations = observations.map((item) => item.summary)
          agentState.workingSet = mergeWorkingSet(
            agentState.workingSet,
            lookupResult.workingSetUpdates,
          )

          if (plannedTool.name === 'get_post') {
            const postSlug = typeof plannedTool.payload === 'object' && plannedTool.payload && 'slug' in plannedTool.payload
              ? String((plannedTool.payload as { slug?: unknown }).slug || '').trim()
              : ''
            if (postSlug) {
              agentState.currentPostSlug = postSlug
              lookedUpPostSlugs.add(postSlug)
            }
          }

          yield {
            type: 'tool_result' as const,
            tool: plannedTool.name,
            payload: lookupResult.payload,
          }

          continue
        }

        if (isWorkspaceMutationTool(plannedTool.name)) {
          if (!prepared.db) {
            throw new Error('DB unavailable for workspace mutation tool execution')
          }

          if (plannedTool.name === 'update_post') {
            const targetSlug = typeof plannedTool.payload === 'object' && plannedTool.payload && 'slug' in plannedTool.payload
              ? String((plannedTool.payload as { slug?: unknown }).slug || '').trim()
              : ''

            if (!canSafelyUpdateTargetPost({
              targetSlug,
              currentOpenPostSlug: prepared.postSlug,
              userMessage: prepared.userMessage,
              lookedUpPostSlugs,
            })) {
              observations = appendObservation(observations, {
                toolName: plannedTool.name,
                summary: `guardrail: update_post 目标文章尚未被明确解析。请先 get_post 读取 slug=${targetSlug || '(missing)'}，或要求用户明确文章目标后再更新。`,
                payload: {
                  targetSlug: targetSlug || null,
                  currentOpenPostSlug: prepared.postSlug || null,
                  lookedUpPostSlugs: [...lookedUpPostSlugs],
                },
              })
              agentState.observations = observations.map((item) => item.summary)
              continue
            }
          }

          yield {
            type: 'tool_pending' as const,
            tool: plannedTool.name,
            payload: plannedTool.payload || null,
          }

          if (plannedTool.name === 'create_post') {
            const created = await executeCreatePostTool(prepared.db, prepared.appEnv, plannedTool.payload as CreatePostToolPayload)
            const action: EditorAiAction = {
              type: 'create_post',
              slug: created.slug,
              title: created.title,
              postId: created.id,
              category: created.category,
              status: created.status === 'published' ? 'published' : 'draft',
            }
            yield {
              type: 'tool_result' as const,
              tool: plannedTool.name,
              payload: created,
            }
            agentState.currentPostSlug = created.slug
            finalAction = action
            finalMessage = plan.message
            break
          }

          const updated = await executeUpdatePostTool(prepared.db, prepared.appEnv, plannedTool.payload as UpdatePostToolPayload)
          const action: EditorAiAction = {
            type: 'update_post',
            slug: updated.slug,
            title: updated.title,
            changedFields: updated.changedFields,
          }
          yield {
            type: 'tool_result' as const,
            tool: plannedTool.name,
            payload: updated,
          }
          agentState.currentPostSlug = updated.slug
          finalAction = action
          finalMessage = plan.message
          break
        }

        if (plannedTool.name === 'web_search') {
          yield { type: 'tool_pending' as const, tool: 'web_search', payload: plannedTool.payload }

          try {
            const { executeWebSearch } = await import('@/lib/ai-editor/web-search')
            const searchResult = await executeWebSearch(
              plannedTool.payload as { query: string; maxResults?: number },
              prepared.appEnv,
            )

            observations = appendObservation(observations, {
              toolName: 'web_search',
              summary: `web_search 搜索了 "${searchResult.query}"，找到 ${searchResult.results.length} 条结果`,
              payload: {
                answer: searchResult.answer,
                topResults: searchResult.results.slice(0, 3).map((r) => ({
                  title: r.title,
                  url: r.url,
                  content: r.content,
                })),
              },
            })

            yield { type: 'tool_result' as const, tool: 'web_search', payload: searchResult }
          } catch (error) {
            observations = appendObservation(observations, {
              toolName: 'web_search',
              summary: 'web_search 暂时不可用（API key 未配置或服务异常），请基于已有知识回复用户',
              payload: { error: error instanceof Error ? error.message : String(error) },
            })
          }

          agentState.observations = observations.map((item) => item.summary)
          continue
        }

        if (isClientEditorTool(plannedTool.name)) {
          const nextAction = normalizeToolCallToAction(plannedTool)
          const nextActionSignature = buildClientActionSignature(nextAction)

          if (nextActionSignature && recentCompletedClientActionSignatures.has(nextActionSignature)) {
            observations = appendObservation(observations, {
              toolName: plannedTool.name,
              summary: `guardrail: ${plannedTool.name} 的完全同签名动作刚执行过，不要重复改同一块或重复生成同一组图片，请直接基于现有结果继续。`,
              payload: { repeatedActionSignature: nextActionSignature },
            })
            agentState.observations = observations.map((item) => item.summary)
            continue
          }

          finalAction = nextAction
          finalMessage = plan.message
          break
        }

        finalAction = normalizeToolCallToAction(plannedTool)
        finalMessage = plan.message
        break
      }

      const resolvedFinalMessage = streamedAssistantMessage.trim() || finalMessage
      const finalResult = createCompletedResult(
        prepared,
        resolvedFinalMessage || '我已经完成了检索，但这轮没有收敛到安全的最终动作。你可以继续指定目标文章或告诉我要生成的新稿方向。',
        finalAction || { type: 'reply_only' },
      )

      if (!streamedAssistantMessage.trim() && finalResult.message.trim()) {
        for (const chunk of chunkAssistantMessage(finalResult.message)) {
          yield {
            type: 'assistant_delta' as const,
            delta: chunk,
          }
        }
      }

      if (finalResult.action.type !== 'reply_only') {
        yield {
          type: 'action_ready' as const,
          action: finalResult.action,
        }
      }

      resolveCompleted(finalResult)
      yield {
        type: 'assistant_done' as const,
        message: finalResult.message,
        action: finalResult.action,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Editor AI runtime failed'
      rejectCompleted(error)
      yield {
        type: 'assistant_error' as const,
        error: message,
      }
    }
  })()

  return {
    taskType,
    context: prepared.context,
    stream,
    completed,
  }
}
