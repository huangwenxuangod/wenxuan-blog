import type { AiEditorToolCall } from '@/lib/ai-editor/agent-tools'
import type { EditorAiAction } from '@/lib/ai-editor/runtime-types'

export type LegacyEditorAiTool =
  | {
      name: 'reply_only'
      payload: null
    }
  | {
      name: 'rewrite_selection'
      payload: {
        markdown: string
      }
    }
  | {
      name: 'insert_text'
      payload: {
        blockIndex?: number
        position?: 'before' | 'after'
        markdown: string
      }
    }
  | {
      name: 'rewrite_block'
      payload: {
        blockIndex: number
        markdown: string
      }
    }
  | {
      name: 'append_section'
      payload: {
        markdown: string
      }
    }
  | {
      name: 'plan_article_images'
      payload: {
        images?: Array<{
          blockIndex: number
          reason: string
          prompt: string
          alt: string
          aspectRatio?: string
          resolution?: string
        }>
        generatedImages?: Array<{
          blockIndex: number
          reason: string
          alt: string
          image: {
            url: string
            alt: string
          }
        }>
      }
    }

export function normalizeToolCallToAction(tool: AiEditorToolCall | null | undefined): EditorAiAction {
  if (!tool || tool.name === 'reply_only') {
    return { type: 'reply_only' }
  }

  if (tool.name === 'rewrite_block' && tool.payload && 'blockIndex' in tool.payload && 'markdown' in tool.payload) {
    return {
      type: 'rewrite_block',
      blockIndex: Number(tool.payload.blockIndex),
      markdown: String(tool.payload.markdown || ''),
    }
  }

  if (tool.name === 'insert_text' && tool.payload && 'markdown' in tool.payload) {
    const payload = tool.payload as {
      blockIndex?: number
      position?: 'before' | 'after'
      markdown: string
    }

    return {
      type: 'insert_text',
      blockIndex: typeof payload.blockIndex === 'number' ? payload.blockIndex : undefined,
      position: payload.position === 'before' ? 'before' : 'after',
      markdown: String(payload.markdown || ''),
    }
  }

  if (tool.name === 'append_section' && tool.payload && 'markdown' in tool.payload) {
    return {
      type: 'append_section',
      markdown: String(tool.payload.markdown || ''),
    }
  }

  if (tool.name === 'plan_article_images' && tool.payload && 'images' in tool.payload && Array.isArray(tool.payload.images)) {
    return {
      type: 'plan_article_images',
      images: tool.payload.images.map((item) => ({
        blockIndex: Number(item.blockIndex),
        reason: String(item.reason || ''),
        prompt: String(item.prompt || ''),
        alt: String(item.alt || ''),
        aspectRatio: item.aspectRatio ? String(item.aspectRatio) : undefined,
        resolution: item.resolution ? String(item.resolution) : undefined,
      })),
    }
  }

  return { type: 'reply_only' }
}

export function convertActionToLegacyTool(action: EditorAiAction): LegacyEditorAiTool {
  if (action.type === 'reply_only') {
    return { name: 'reply_only', payload: null }
  }

  if (action.type === 'rewrite_block') {
    return {
      name: 'rewrite_block',
      payload: {
        blockIndex: action.blockIndex,
        markdown: action.markdown,
      },
    }
  }

  if (action.type === 'insert_text') {
    return {
      name: 'insert_text',
      payload: {
        blockIndex: action.blockIndex,
        position: action.position,
        markdown: action.markdown,
      },
    }
  }

  if (action.type === 'append_section') {
    return {
      name: 'append_section',
      payload: {
        markdown: action.markdown,
      },
    }
  }

  if (action.type === 'rewrite_selection') {
    return {
      name: 'rewrite_selection',
      payload: {
        markdown: action.markdown,
      },
    }
  }

  return {
    name: 'plan_article_images',
    payload: {
      images: action.images,
    },
  }
}
