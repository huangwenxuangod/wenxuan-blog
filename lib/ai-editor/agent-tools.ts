import type { EditorDocumentBlock } from '@/lib/ai-editor/types'

export type AiEditorToolName =
  | 'reply_only'
  | 'edit_title'
  | 'edit_selection'
  | 'insert_block'
  | 'generate_image'
  | 'insert_text'
  | 'rewrite_block'
  | 'append_section'
  | 'plan_article_images'

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

export interface GenerateImageToolPayload {
  prompt: string
  usage: 'inline' | 'cover'
  anchorBlockIndex?: number
  alt?: string
  aspectRatio?: string
  resolution?: string
}

export type AiEditorToolPayload =
  | EditTitleToolPayload
  | EditSelectionToolPayload
  | InsertBlockToolPayload
  | GenerateImageToolPayload
  | null

export interface AiEditorToolCall {
  name: AiEditorToolName
  payload: AiEditorToolPayload
}

export function describeAiEditorTools(outline: EditorDocumentBlock[]) {
  return `
你是文章写作助手。你不需要征求用户二次确认，可以直接执行最合适的编辑动作。
你必须优先利用当前聚焦区域、相关召回块和结构化记忆来判断动作范围，不要默认整篇改写。

你必须只返回一个 JSON 对象，结构如下：
{
  "message": "给用户看的简短回复",
  "tool": {
    "name": "reply_only | edit_title | edit_selection | insert_block | generate_image",
    "payload": {}
  }
}

工具说明：
- reply_only: 仅回复，不改文
- edit_title: 直接改文章标题，payload 结构：{ "title": "..." }
- edit_selection: 改当前选区；如果没有选区，则改当前 block，payload 结构：{ "markdown": "..." }
- insert_block: 在某个 block 前后或文末插入 markdown，payload 结构：{ "anchorBlockIndex": 2, "position": "after | before | end", "markdown": "..." }
- generate_image: 生成图片并插入正文或设为封面，payload 结构：
  { "prompt": "...", "usage": "inline | cover", "anchorBlockIndex": 2, "alt": "...", "aspectRatio": "16:9", "resolution": "2k" }

约束：
- blockIndex 必须基于下面给出的文章块列表，从 0 开始
- 优先局部编辑，不要默认整篇重写
- 如果要改文，尽量只改当前选区、当前 block、当前 section 或明确召回出的相关 block
- 如果用户是问答、 brainstorming、解释概念，则用 reply_only
- 如果用户要求改标题，优先用 edit_title，不要把新标题塞进正文
- 如果用户要求插图，优先用 generate_image，usage 默认 inline，anchorBlockIndex 要尽量明确
- 返回必须是合法 JSON，不要加 markdown 代码块

当前文章块列表：
${outline.map((block) => `- ${block.index}: [${block.type}] ${block.text.slice(0, 200) || '(空块)'}`).join('\n')}
  `.trim()
}
