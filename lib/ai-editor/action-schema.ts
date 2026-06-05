import type { AiEditorToolCall } from '@/lib/ai-editor/agent-tools'
import type { EditorAiAction } from '@/lib/ai-editor/runtime-types'

export type LegacyEditorAiTool =
  | {
      name: 'reply_only'
      payload: null
    }
  | {
      name: 'edit_title'
      payload: {
        title: string
      }
    }
  | {
      name: 'edit_selection'
      payload: {
        markdown: string
        blockIndex?: number
      }
    }
  | {
      name: 'insert_block'
      payload: {
        anchorBlockIndex?: number
        position?: 'before' | 'after' | 'end'
        markdown: string
      }
    }
  | {
      name: 'generate_image'
      payload: {
        prompt: string
        usage: 'inline' | 'cover'
        anchorBlockIndex?: number
        alt?: string
        aspectRatio?: string
        resolution?: string
        generatedImage?: {
          url: string
          alt: string
        }
      }
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

  if (tool.name === 'edit_title' && tool.payload && 'title' in tool.payload) {
    return {
      type: 'edit_title',
      title: String(tool.payload.title || ''),
    }
  }

  if (tool.name === 'edit_selection' && tool.payload && 'markdown' in tool.payload) {
    return {
      type: 'edit_selection',
      markdown: String(tool.payload.markdown || ''),
      blockIndex: 'blockIndex' in tool.payload && typeof tool.payload.blockIndex === 'number'
        ? Number(tool.payload.blockIndex)
        : undefined,
    }
  }

  if (tool.name === 'insert_block' && tool.payload && 'markdown' in tool.payload) {
    const payload = tool.payload as {
      anchorBlockIndex?: number
      position?: 'before' | 'after' | 'end'
      markdown: string
    }

    return {
      type: 'insert_block',
      anchorBlockIndex: typeof payload.anchorBlockIndex === 'number' ? payload.anchorBlockIndex : undefined,
      position: payload.position === 'before' || payload.position === 'after' ? payload.position : 'end',
      markdown: String(payload.markdown || ''),
    }
  }

  if (tool.name === 'generate_image' && tool.payload && 'prompt' in tool.payload) {
    return {
      type: 'generate_image',
      prompt: String(tool.payload.prompt || ''),
      usage: tool.payload.usage === 'cover' ? 'cover' : 'inline',
      anchorBlockIndex: 'anchorBlockIndex' in tool.payload && typeof tool.payload.anchorBlockIndex === 'number'
        ? Number(tool.payload.anchorBlockIndex)
        : undefined,
      alt: 'alt' in tool.payload && typeof tool.payload.alt === 'string' ? tool.payload.alt : undefined,
      aspectRatio: 'aspectRatio' in tool.payload && typeof tool.payload.aspectRatio === 'string'
        ? tool.payload.aspectRatio
        : undefined,
      resolution: 'resolution' in tool.payload && typeof tool.payload.resolution === 'string'
        ? tool.payload.resolution
        : undefined,
    }
  }

  // Legacy compatibility
  const toolName = tool.name as string

  if (toolName === 'rewrite_block' && tool.payload && 'blockIndex' in tool.payload && 'markdown' in tool.payload) {
    const payload = tool.payload as unknown as Record<string, unknown>
    return {
      type: 'edit_selection',
      blockIndex: Number(payload.blockIndex),
      markdown: String(payload.markdown || ''),
    }
  }

  if (toolName === 'rewrite_selection' && tool.payload && 'markdown' in tool.payload) {
    const payload = tool.payload as unknown as Record<string, unknown>
    return {
      type: 'edit_selection',
      markdown: String(payload.markdown || ''),
    }
  }

  if (toolName === 'insert_text' && tool.payload && 'markdown' in tool.payload) {
    const payload = tool.payload as {
      blockIndex?: number
      position?: 'before' | 'after'
      markdown: string
    }

    return {
      type: 'insert_block',
      anchorBlockIndex: typeof payload.blockIndex === 'number' ? payload.blockIndex : undefined,
      position: payload.position === 'before' ? 'before' : 'after',
      markdown: String(payload.markdown || ''),
    }
  }

  if (tool.name === 'append_section' && tool.payload && 'markdown' in tool.payload) {
    return {
      type: 'insert_block',
      position: 'end',
      markdown: String(tool.payload.markdown || ''),
    }
  }

  if (tool.name === 'plan_article_images' && tool.payload && 'images' in tool.payload && Array.isArray(tool.payload.images)) {
    const firstImage = tool.payload.images[0]
    if (!firstImage) {
      return { type: 'reply_only' }
    }

    return {
      type: 'generate_image',
      prompt: String(firstImage.prompt || ''),
      usage: 'inline',
      anchorBlockIndex: Number(firstImage.blockIndex),
      alt: String(firstImage.alt || ''),
      aspectRatio: firstImage.aspectRatio ? String(firstImage.aspectRatio) : undefined,
      resolution: firstImage.resolution ? String(firstImage.resolution) : undefined,
    }
  }

  return { type: 'reply_only' }
}

export function convertActionToLegacyTool(action: EditorAiAction): LegacyEditorAiTool {
  if (action.type === 'reply_only') {
    return { name: 'reply_only', payload: null }
  }

  if (action.type === 'edit_title') {
    return {
      name: 'edit_title',
      payload: {
        title: action.title,
      },
    }
  }

  if (action.type === 'edit_selection') {
    return {
      name: 'edit_selection',
      payload: {
        markdown: action.markdown,
        blockIndex: action.blockIndex,
      },
    }
  }

  if (action.type === 'insert_block') {
    return {
      name: 'insert_block',
      payload: {
        anchorBlockIndex: action.anchorBlockIndex,
        position: action.position,
        markdown: action.markdown,
      },
    }
  }

  if (action.type === 'generate_image') {
    return {
      name: 'generate_image',
      payload: {
        prompt: action.prompt,
        usage: action.usage,
        anchorBlockIndex: action.anchorBlockIndex,
        alt: action.alt,
        aspectRatio: action.aspectRatio,
        resolution: action.resolution,
      },
    }
  }

  return { name: 'reply_only', payload: null }
}
