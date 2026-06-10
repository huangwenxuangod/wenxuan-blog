import { nanoid } from 'nanoid'
import {
  buildAssetUrls,
  buildCoverPrompt,
} from '@/lib/ai-post-generator/prompts'
import { getAiPostGeneratorByTarget } from '@/lib/ai-post-generator/storage'
import type {
  GeneratePostCoverInput,
  GeneratedPostCoverResult,
} from '@/lib/ai-post-generator/types'
import { resolveImageSceneBinding } from '@/lib/ai-image/scenes'

function readFlag(value: unknown): boolean {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

export async function generatePostCover(
  input: GeneratePostCoverInput,
): Promise<GeneratedPostCoverResult> {
  const generator = await getAiPostGeneratorByTarget(input.db, 'cover', input.env)
  if (!generator || generator.is_enabled !== 1) {
    throw new Error('当前封面生成功能未启用')
  }

  const articleCoverBinding = await resolveImageSceneBinding(input.db, 'article_cover')
  if (!articleCoverBinding?.action_key) {
    throw new Error('请先在图片模板中为文章封面绑定默认模板')
  }

  const { generateEditorImage } = await import('@/lib/ai-image')
  const image = await generateEditorImage({
    action: articleCoverBinding.action_key,
    actionLabel: generator.label,
    userPrompt: buildCoverPrompt(generator, input),
    articleTitle: input.title,
    contextText: input.content,
    db: input.db,
    env: input.env as Record<string, string | undefined> | undefined,
    images: input.images,
  })

  return { generator, image }
}
