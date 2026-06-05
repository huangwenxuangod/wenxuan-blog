import type { EditorAiRuntimePreparedInput, EditorAiTaskType } from '@/lib/ai-editor/runtime-types'

function matches(text: string, pattern: RegExp) {
  return pattern.test(text)
}

export function classifyEditorAiTask(input: EditorAiRuntimePreparedInput): EditorAiTaskType {
  const message = input.userMessage.trim()
  const hasSelection = Boolean((input.selectionText || '').trim())
  const hasActiveBlock = Number.isInteger(input.activeBlockIndex)

  if (matches(message, /(配图|插图|图片规划|规划.*图|图像规划|visual plan|image plan)/i)) {
    return 'image_plan'
  }

  if (matches(message, /(生成图片|生图|封面图|插一张图|生成一张图|image generate|illustration)/i)) {
    return 'image_generate'
  }

  if (matches(message, /(补一个标题结构|整理结构|大纲|outline|结构调整)/i)) {
    return 'outline_fix'
  }

  if (matches(message, /(压缩|精简|更短|缩写|compress|shorten)/i)) {
    return 'compress'
  }

  if (matches(message, /(扩写|展开讲|补充|续写|丰富|expand)/i)) {
    return 'expand'
  }

  if (matches(message, /(润色|改一下|重写|改写|rewrite|polish)/i)) {
    if (hasSelection) return 'rewrite'
    if (hasActiveBlock) return 'rewrite'
  }

  return 'chat'
}
