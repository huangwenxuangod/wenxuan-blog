import type { EditorDocumentBlock } from '@/lib/editor-document-outline'

export type AiEditorToolName =
  | 'reply_only'
  | 'insert_text'
  | 'rewrite_block'
  | 'append_section'
  | 'plan_article_images'

export interface InsertTextToolPayload {
  blockIndex?: number
  position?: 'before' | 'after'
  markdown: string
}

export interface RewriteBlockToolPayload {
  blockIndex: number
  markdown: string
}

export interface AppendSectionToolPayload {
  markdown: string
}

export interface PlanArticleImagesItem {
  blockIndex: number
  reason: string
  prompt: string
  alt: string
  aspectRatio?: string
  resolution?: string
}

export interface PlanArticleImagesToolPayload {
  images: PlanArticleImagesItem[]
}

export type AiEditorToolPayload =
  | InsertTextToolPayload
  | RewriteBlockToolPayload
  | AppendSectionToolPayload
  | PlanArticleImagesToolPayload
  | null

export interface AiEditorToolCall {
  name: AiEditorToolName
  payload: AiEditorToolPayload
}

export function describeAiEditorTools(outline: EditorDocumentBlock[]) {
  return `
你是文章写作助手。你不需要征求用户二次确认，可以直接执行最合适的编辑动作。

你必须只返回一个 JSON 对象，结构如下：
{
  "message": "给用户看的简短回复",
  "tool": {
    "name": "reply_only | insert_text | rewrite_block | append_section | plan_article_images",
    "payload": {}
  }
}

工具说明：
- reply_only: 仅回复，不改文
- insert_text: 在某个 block 前后插入 markdown
- rewrite_block: 重写某个 block，返回 markdown
- append_section: 在文末追加 markdown
- plan_article_images: 生成多张文章配图计划，payload 结构：
  { "images": [{ "blockIndex": 2, "reason": "...", "prompt": "...", "alt": "...", "aspectRatio": "16:9", "resolution": "2k" }] }

约束：
- blockIndex 必须基于下面给出的文章块列表，从 0 开始
- 优先局部编辑，不要默认整篇重写
- 如果用户是问答、 brainstorming、解释概念，则用 reply_only
- 如果用户要求自动配图，可以选择 1-6 张图，位置要分散且合理
- 返回必须是合法 JSON，不要加 markdown 代码块

当前文章块列表：
${outline.map((block) => `- ${block.index}: [${block.type}] ${block.text.slice(0, 200) || '(空块)'}`).join('\n')}
  `.trim()
}
