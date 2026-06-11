import type { AiEditorToolCall } from '@/lib/ai-editor/tool-registry'
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
      name: 'create_post'
      payload: {
        slug: string
        title: string
        postId?: number
        category?: string
        status?: 'draft' | 'published'
      }
    }
  | {
      name: 'update_post'
      payload: {
        slug: string
        title?: string
        changedFields: string[]
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
      name: 'generate_images'
      payload: {
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
        generatedImages?: Array<{
          prompt: string
          usage: 'inline' | 'cover'
          anchorBlockIndex?: number
          sourceBlockIndex?: number
          sourceHeadingPath?: string[]
          generationReason?: string
          visualRole?: string
          styleFingerprint?: string
          alt?: string
          image: {
            url: string
            alt: string
          }
        }>
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

  if (tool.name === 'create_post' && tool.payload && 'slug' in tool.payload && 'title' in tool.payload) {
    return {
      type: 'create_post',
      slug: String(tool.payload.slug || ''),
      title: String(tool.payload.title || ''),
      postId: 'postId' in tool.payload && typeof tool.payload.postId === 'number'
        ? Number(tool.payload.postId)
        : undefined,
      category: 'category' in tool.payload && typeof tool.payload.category === 'string'
        ? String(tool.payload.category)
        : undefined,
      status: 'status' in tool.payload && (tool.payload.status === 'draft' || tool.payload.status === 'published')
        ? tool.payload.status
        : undefined,
    }
  }

  if (tool.name === 'update_post' && tool.payload && 'slug' in tool.payload) {
    return {
      type: 'update_post',
      slug: String(tool.payload.slug || ''),
      title: 'title' in tool.payload && typeof tool.payload.title === 'string'
        ? String(tool.payload.title)
        : undefined,
      changedFields: 'changedFields' in tool.payload && Array.isArray(tool.payload.changedFields)
        ? tool.payload.changedFields.filter((item): item is string => typeof item === 'string')
        : [],
    }
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

  if (tool.name === 'generate_images' && tool.payload && 'images' in tool.payload && Array.isArray(tool.payload.images)) {
    const images: Extract<EditorAiAction, { type: 'generate_images' }>['images'] = tool.payload.images
      .slice(0, 5)
      .map((item) => ({
        prompt: String(item?.prompt || ''),
        usage: item?.usage === 'cover' ? 'cover' as const : 'inline' as const,
        anchorBlockIndex: typeof item?.anchorBlockIndex === 'number'
          ? Number(item.anchorBlockIndex)
          : undefined,
        sourceBlockIndex: typeof item?.sourceBlockIndex === 'number'
          ? Number(item.sourceBlockIndex)
          : undefined,
        sourceHeadingPath: Array.isArray(item?.sourceHeadingPath)
          ? item.sourceHeadingPath.filter((part): part is string => typeof part === 'string').slice(0, 6)
          : undefined,
        generationReason: typeof item?.generationReason === 'string' ? item.generationReason : undefined,
        visualRole: typeof item?.visualRole === 'string' ? item.visualRole : undefined,
        styleFingerprint: typeof item?.styleFingerprint === 'string' ? item.styleFingerprint : undefined,
        alt: typeof item?.alt === 'string' ? item.alt : undefined,
        aspectRatio: typeof item?.aspectRatio === 'string' ? item.aspectRatio : undefined,
        resolution: typeof item?.resolution === 'string' ? item.resolution : undefined,
        imageProfileId: null,
      }))
      .filter((item) => item.prompt.trim().length > 0)

    return {
      type: 'generate_images',
      images,
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
    const payload = tool.payload as unknown as Extract<LegacyEditorAiTool, { name: 'plan_article_images' }>['payload']
    const plannedImages: Extract<EditorAiAction, { type: 'generate_images' }>['images'] = (payload.images || [])
      .slice(0, 5)
      .map((item) => ({
        prompt: String(item.prompt || ''),
        usage: 'inline' as const,
        anchorBlockIndex: Number(item.blockIndex),
        sourceBlockIndex: Number(item.blockIndex),
        generationReason: String(item.reason || ''),
        alt: String(item.alt || ''),
        aspectRatio: item.aspectRatio ? String(item.aspectRatio) : undefined,
        resolution: item.resolution ? String(item.resolution) : undefined,
        imageProfileId: null,
      }))
      .filter((item) => item.prompt.trim().length > 0)

    if (plannedImages.length === 0) {
      return { type: 'reply_only' }
    }

    return {
      type: 'generate_images',
      images: plannedImages,
    }
  }

  return { type: 'reply_only' }
}

export function convertActionToLegacyTool(action: EditorAiAction): LegacyEditorAiTool {
  if (action.type === 'reply_only') {
    return { name: 'reply_only', payload: null }
  }

  if (action.type === 'create_post') {
    return {
      name: 'create_post',
      payload: {
        slug: action.slug,
        title: action.title,
        postId: action.postId,
        category: action.category,
        status: action.status,
      },
    }
  }

  if (action.type === 'update_post') {
    return {
      name: 'update_post',
      payload: {
        slug: action.slug,
        title: action.title,
        changedFields: action.changedFields,
      },
    }
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

  if (action.type === 'generate_images') {
    return {
      name: 'generate_images',
      payload: {
        images: action.images.map((item) => ({
          prompt: item.prompt,
          usage: item.usage,
          anchorBlockIndex: item.anchorBlockIndex,
          sourceBlockIndex: item.sourceBlockIndex,
          sourceHeadingPath: item.sourceHeadingPath,
          generationReason: item.generationReason,
          visualRole: item.visualRole,
          styleFingerprint: item.styleFingerprint,
          alt: item.alt,
          aspectRatio: item.aspectRatio,
          resolution: item.resolution,
        })),
      },
    }
  }

  return { name: 'reply_only', payload: null }
}
