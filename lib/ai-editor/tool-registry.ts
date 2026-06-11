import type { EditorDocumentBlock } from '@/lib/ai-editor/types'

export type CanonicalEditorToolName =
  | 'reply_only'
  | 'list_posts'
  | 'search_posts'
  | 'get_post'
  | 'create_post'
  | 'update_post'
  | 'edit_title'
  | 'edit_selection'
  | 'insert_block'
  | 'generate_images'

export type LegacyEditorToolAlias =
  | 'insert_text'
  | 'rewrite_block'
  | 'append_section'
  | 'plan_article_images'
  | 'rewrite_selection'

export type AiEditorToolName = CanonicalEditorToolName | LegacyEditorToolAlias

export interface ReplyOnlyToolCall {
  name: 'reply_only'
  payload: null
}

export interface ListPostsToolPayload {
  limit?: number
  category?: string
  status?: 'draft' | 'published' | 'deleted'
  includeHidden?: boolean
  includeEncrypted?: boolean
}

export interface SearchPostsToolPayload {
  query: string
  limit?: number
  includeDrafts?: boolean
  includeHidden?: boolean
  includeEncrypted?: boolean
  includeDeleted?: boolean
}

export interface GetPostToolPayload {
  slug: string
}

export interface CreatePostToolPayload {
  title: string
  content: string
  category?: string
  slug?: string
  description?: string
  tags?: string[]
  status?: 'draft' | 'published'
  coverImage?: string | null
}

export interface UpdatePostToolPayload {
  slug: string
  updates: {
    title?: string
    content?: string
    category?: string
    description?: string
    tags?: string[]
    status?: 'draft' | 'published' | 'deleted'
    coverImage?: string | null
    newSlug?: string
  }
}

export interface EditTitleToolPayload {
  title: string
}

export interface EditSelectionToolPayload {
  markdown: string
  blockIndex?: number
}

export interface InsertBlockToolPayload {
  anchorBlockIndex?: number
  position?: 'before' | 'after' | 'end'
  markdown: string
}

export interface GenerateImagesToolPayload {
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
  }>
}

export type AiEditorToolPayload =
  | null
  | ListPostsToolPayload
  | SearchPostsToolPayload
  | GetPostToolPayload
  | CreatePostToolPayload
  | UpdatePostToolPayload
  | EditTitleToolPayload
  | EditSelectionToolPayload
  | InsertBlockToolPayload
  | GenerateImagesToolPayload

export type AiEditorToolCall =
  | ReplyOnlyToolCall
  | { name: 'list_posts'; payload: ListPostsToolPayload }
  | { name: 'search_posts'; payload: SearchPostsToolPayload }
  | { name: 'get_post'; payload: GetPostToolPayload }
  | { name: 'create_post'; payload: CreatePostToolPayload }
  | { name: 'update_post'; payload: UpdatePostToolPayload }
  | { name: 'edit_title'; payload: EditTitleToolPayload }
  | { name: 'edit_selection'; payload: EditSelectionToolPayload }
  | { name: 'insert_block'; payload: InsertBlockToolPayload }
  | { name: 'generate_images'; payload: GenerateImagesToolPayload }
  | { name: LegacyEditorToolAlias; payload: Record<string, unknown> | null }

const LEGACY_EDITOR_TOOL_ALIASES: LegacyEditorToolAlias[] = [
  'insert_text',
  'rewrite_block',
  'append_section',
  'plan_article_images',
  'rewrite_selection',
]

export const CANONICAL_EDITOR_TOOL_NAMES: CanonicalEditorToolName[] = [
  'reply_only',
  'list_posts',
  'search_posts',
  'get_post',
  'create_post',
  'update_post',
  'edit_title',
  'edit_selection',
  'insert_block',
  'generate_images',
]

export function isLookupTool(name: AiEditorToolName): name is 'list_posts' | 'search_posts' | 'get_post' {
  return name === 'list_posts' || name === 'search_posts' || name === 'get_post'
}

export function isWorkspaceMutationTool(name: AiEditorToolName): name is 'create_post' | 'update_post' {
  return name === 'create_post' || name === 'update_post'
}

export function isClientEditorTool(name: AiEditorToolName): name is 'edit_title' | 'edit_selection' | 'insert_block' | 'generate_images' {
  return name === 'edit_title' || name === 'edit_selection' || name === 'insert_block' || name === 'generate_images'
}

export function isCanonicalToolName(name: string): name is CanonicalEditorToolName {
  return CANONICAL_EDITOR_TOOL_NAMES.includes(name as CanonicalEditorToolName)
}

export function isSupportedEditorToolName(name: string): name is AiEditorToolName {
  return isCanonicalToolName(name) || LEGACY_EDITOR_TOOL_ALIASES.includes(name as LegacyEditorToolAlias)
}

export function normalizeAiEditorToolCall(
  tool: {
    name?: unknown
    payload?: unknown
  } | null | undefined,
): AiEditorToolCall {
  if (!tool || typeof tool.name !== 'string' || !isSupportedEditorToolName(tool.name)) {
    return { name: 'reply_only', payload: null }
  }

  const payload = tool.payload && typeof tool.payload === 'object' && !Array.isArray(tool.payload)
    ? tool.payload as Record<string, unknown>
    : null

  if (tool.name === 'reply_only') {
    return { name: 'reply_only', payload: null }
  }

  return {
    name: tool.name,
    payload,
  } as AiEditorToolCall
}

export function describeAiEditorTools(outline: EditorDocumentBlock[]) {
  return `
你是全站文章工作区 agent。
你不只是当前文章助手，还拥有后台文章库的检索、读取、新建和修改能力。
你不需要征求用户二次确认，可以直接执行最合适的动作，但不得在目标文章不明确时修改已有文章。
你必须优先利用当前聚焦区域、相关召回块、结构化记忆和工具观察结果来判断动作范围，不要默认整篇改写。

你必须只返回一个 JSON 对象，结构如下：
{
  "message": "给用户看的简短回复",
  "tool": {
    "name": "reply_only | list_posts | search_posts | get_post | create_post | update_post | edit_title | edit_selection | insert_block | generate_images",
    "payload": {}
  }
}

工具说明：
- reply_only: 仅回复，不执行任何改动
- list_posts: 列出文章，用于快速查看最近文章或某个分类/状态下的文章
- search_posts: 用关键词全站搜索文章；需要 payload.query
- get_post: 读取指定文章完整内容；需要 payload.slug
- create_post: 新建文章；需要 payload.title 和 payload.content，可选 category / slug / description / tags / status / coverImage
- update_post: 修改已有文章；需要 payload.slug 和 payload.updates。目标不明确时禁止使用
- edit_title: 只修改当前打开文章标题，payload: { "title": "..." }
- edit_selection: 修改当前选区；如果没有选区，则改当前 block，payload: { "markdown": "...", "blockIndex"?: number }
- insert_block: 在当前打开文章某个 block 前后或文末插入 markdown，payload: { "anchorBlockIndex"?: 2, "position"?: "after | before | end", "markdown": "..." }
- generate_images: 为当前文章规划并生成 1-5 张图片，payload:
  {
    "images": [
      { "prompt": "...", "usage": "inline | cover", "anchorBlockIndex": 2, "sourceBlockIndex"?: 2, "sourceHeadingPath"?: ["H2","H3"], "generationReason"?: "...", "visualRole"?: "section_hero | inline_explainer | cover", "styleFingerprint"?: "...", "alt": "...", "aspectRatio": "16:9", "resolution": "2k" }
    ]
  }

选择规则：
- 如果用户只是在问答、 brainstorming 或解释概念，用 reply_only
- 如果用户要找旧文章或参考其它文章，优先 list_posts / search_posts / get_post
- 如果用户要“基于现有文章生成一篇新稿”，优先先 get_post，再 create_post
- 如果用户要修改当前打开文章，优先 edit_title / edit_selection / insert_block / generate_images
- 如果用户要修改其它文章，必须先明确 slug，再用 update_post
- generate_images 最多返回 5 张图；没有必要时返回 1 张即可
- 返回必须是合法 JSON，不要加 Markdown 代码块

当前打开文章块列表：
${outline.map((block) => `- ${block.index}: [${block.type}] ${block.text.slice(0, 200) || '(空块)'}`).join('\n')}
  `.trim()
}
