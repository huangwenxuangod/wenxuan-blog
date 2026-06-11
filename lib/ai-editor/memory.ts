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
    payload?: Record<string, unknown> | null
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
  const assistantText = (input.assistantMessage || '').trim()
  if (!text && !input.tool) return []

  const candidates: AiEditorMemoryWrite[] = []
  const wantsImage = /(图|配图|插图|封面|视觉|图片|image|illustration)/i.test(text)
  const mentionsStyle = /(风格|语气|语调|克制|极简|明亮|亮色|暗色|配色|标题|正文|字体)/i.test(text)
  const mentionsPreference = /(我希望|希望|不要|只要|尽量|主要是|我想要)/i.test(text)
  const mentionsGoal = /(文章|这篇|目标|读者|受众|核心|重点|方向)/i.test(text)
  const mentionsDecision = /(就用|固定|统一|默认|定成|保持|按这个来)/i.test(text)
  const mentionsOpenTask = /(接下来|下一步|后面|之后|继续|还要|还需要|记得|待会|后续)/i.test(text)

  if (text && (mentionsStyle || mentionsPreference)) {
    candidates.push(createMemoryWrite(
      wantsImage ? 'image_style' : 'style',
      wantsImage ? '视觉偏好' : '写作偏好',
      text,
    ))
  }

  if (text && mentionsGoal) {
    candidates.push(createMemoryWrite(
      'plan',
      '当前文章目标',
      text,
    ))
  }

  if (text && mentionsDecision) {
    candidates.push(createMemoryWrite(
      'decision',
      '已确定的执行规则',
      text,
    ))
  }

  if (text && mentionsOpenTask) {
    candidates.push(createMemoryWrite(
      'open_task',
      '待继续推进的事项',
      text,
    ))
  }

  if (input.tool && input.tool.name !== 'reply_only') {
    candidates.push(createMemoryWrite(
      'completed_task',
      '最近一次 AI 执行动作',
      `${input.tool.name}: ${assistantText || text || `${input.tool.name} 已执行`}`,
      {
        toolName: input.tool.name,
        toolPayload: input.tool.payload || null,
      },
    ))
  }

  if (input.tool?.name === 'generate_images') {
    const payload = input.tool.payload || null
    const images = Array.isArray(payload?.images)
      ? payload.images as Array<Record<string, unknown>>
      : []
    const executionResults = payload && typeof payload === 'object' && payload.execution && typeof payload.execution === 'object' && Array.isArray((payload.execution as { results?: unknown[] }).results)
      ? ((payload.execution as { results: Array<Record<string, unknown>> }).results)
      : []

    const styleFingerprints = [
      ...images.map((item) => typeof item.styleFingerprint === 'string' ? item.styleFingerprint.trim() : ''),
      ...executionResults.map((item) => typeof item.styleFingerprint === 'string' ? item.styleFingerprint.trim() : ''),
    ].filter(Boolean)

    const visualRoles = [
      ...images.map((item) => typeof item.visualRole === 'string' ? item.visualRole.trim() : ''),
      ...executionResults.map((item) => typeof item.visualRole === 'string' ? item.visualRole.trim() : ''),
    ].filter(Boolean)

    const reasons = [
      ...images.map((item) => typeof item.generationReason === 'string' ? item.generationReason.trim() : ''),
      ...executionResults.map((item) => typeof item.generationReason === 'string' ? item.generationReason.trim() : ''),
    ].filter(Boolean)

    if (styleFingerprints.length > 0 || visualRoles.length > 0 || reasons.length > 0) {
      candidates.push(createMemoryWrite(
        'image_style',
        '当前文章视觉方向',
        [
          styleFingerprints.length > 0 ? `风格指纹：${styleFingerprints.slice(0, 2).join('；')}` : '',
          visualRoles.length > 0 ? `视觉角色：${visualRoles.slice(0, 3).join('、')}` : '',
          reasons.length > 0 ? `原因：${reasons[0]}` : '',
        ].filter(Boolean).join('；'),
        {
          styleFingerprints: styleFingerprints.slice(0, 4),
          visualRoles: visualRoles.slice(0, 6),
          reasons: reasons.slice(0, 4),
        },
      ))
    }
  }

  return candidates
    .filter((candidate) => candidate.summary.length >= 8)
    .slice(0, 5)
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
