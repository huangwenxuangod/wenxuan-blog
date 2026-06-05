import type {
  AiEditorMemoryItem,
  AiEditorMemoryKind,
  AiEditorMemoryWrite,
} from '@/lib/ai-editor/types'

interface DeriveMemoryCandidatesInput {
  userMessage: string
  assistantMessage?: string
  tool?: {
    name: string
  } | null
}

function clipText(text: string, max = 220) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function createMemoryWrite(
  kind: AiEditorMemoryKind,
  title: string,
  summary: string,
  payload?: Record<string, unknown> | null,
): AiEditorMemoryWrite {
  return {
    scope: 'article',
    kind,
    title,
    summary: clipText(summary.trim()),
    payload: payload || null,
    confidence: kind === 'decision' ? 0.84 : 0.72,
  }
}

export function deriveAiEditorMemoryCandidates(input: DeriveMemoryCandidatesInput) {
  const text = input.userMessage.trim()
  if (!text) return []

  const candidates: AiEditorMemoryWrite[] = []
  const wantsImage = /(图|配图|插图|封面|视觉|图片|image|illustration)/i.test(text)
  const mentionsStyle = /(风格|语气|语调|克制|极简|明亮|亮色|暗色|配色|标题|正文|字体)/i.test(text)
  const mentionsPreference = /(我希望|希望|不要|只要|尽量|主要是|我想要)/i.test(text)
  const mentionsGoal = /(文章|这篇|目标|读者|受众|核心|重点|方向)/i.test(text)

  if (mentionsStyle || mentionsPreference) {
    candidates.push(createMemoryWrite(
      wantsImage ? 'image_style' : 'style',
      wantsImage ? '视觉偏好' : '写作偏好',
      text,
    ))
  }

  if (mentionsGoal) {
    candidates.push(createMemoryWrite(
      'plan',
      '当前文章目标',
      text,
    ))
  }

  if (input.tool && input.tool.name !== 'reply_only') {
    candidates.push(createMemoryWrite(
      'completed_task',
      '最近一次 AI 执行动作',
      `${input.tool.name}: ${input.assistantMessage || text}`,
      {
        toolName: input.tool.name,
      },
    ))
  }

  return candidates
    .filter((candidate) => candidate.summary.length >= 8)
    .slice(0, 3)
}

export function buildAiEditorMemorySummary(memoryItems: AiEditorMemoryItem[]) {
  const activeItems = memoryItems.filter((item) => !item.archived)
  if (activeItems.length === 0) {
    return '暂无结构化记忆。'
  }

  const pick = (kind: AiEditorMemoryKind) => activeItems.filter((item) => item.kind === kind)
  const lines: string[] = []

  const goals = pick('plan').concat(pick('fact')).slice(0, 2)
  const styles = pick('style').concat(pick('preference')).slice(0, 2)
  const decisions = pick('decision').concat(pick('completed_task')).slice(0, 2)
  const imageStyles = pick('image_style').slice(0, 1)
  const tasks = pick('open_task').slice(0, 2)

  if (goals.length > 0) {
    lines.push(`文章目标：${goals.map((item) => item.summary).join('；')}`)
  }
  if (styles.length > 0) {
    lines.push(`风格偏好：${styles.map((item) => item.summary).join('；')}`)
  }
  if (decisions.length > 0) {
    lines.push(`已执行动作：${decisions.map((item) => item.summary).join('；')}`)
  }
  if (imageStyles.length > 0) {
    lines.push(`视觉方向：${imageStyles.map((item) => item.summary).join('；')}`)
  }
  if (tasks.length > 0) {
    lines.push(`待办事项：${tasks.map((item) => item.summary).join('；')}`)
  }

  return lines.join('\n') || '暂无结构化记忆。'
}
