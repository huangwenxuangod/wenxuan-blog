// 📡 写作羞辱引擎 — Ship or Die
// 目标：每周 5 篇 >=1000 字的 published 文章

export const WEEKLY_GOAL = 5
export const MIN_WORDS = 1000

export interface WeeklyWritingStats {
  weekStart: string    // ISO date, Monday
  weekEnd: string      // ISO date, Sunday
  publishedCount: number
  goal: number
  met: boolean
  daysSinceLastPost: number
}

export interface ShameMessage {
  title: string        // 大标题，比如「他又没写完」
  subtitle: string     // 副标题，带数据
  style: 'cold' | 'fierce' | 'tease' | 'data'
  severity: number     // 1-5，缺得越多越狠
}

function getWeekBounds(): { start: Date; end: Date } {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek

  const monday = new Date(now)
  monday.setDate(now.getDate() + mondayOffset)
  monday.setHours(0, 0, 0, 0)

  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)

  return { start: monday, end: sunday }
}

function calculateWordCount(content: string): number {
  const text = (content || '').trim()
  if (!text) return 0
  // 中英文混合计数
  const chineseChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length
  const englishWords = text
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length
  return chineseChars + englishWords
}

export async function getWeeklyWritingStats(db: D1Database): Promise<WeeklyWritingStats> {
  const { start, end } = getWeekBounds()
  const weekStart = start.toISOString().split('T')[0]
  const weekEnd = end.toISOString().split('T')[0]

  // 查询本周发布的文章（按 published_at 在周范围内，status = 'published'）
  const { results } = await db.prepare(`
    SELECT content FROM posts
    WHERE status = 'published'
      AND published_at >= ?1
      AND published_at <= ?2
    ORDER BY published_at DESC
  `).bind(
    Math.floor(start.getTime() / 1000),
    Math.floor(end.getTime() / 1000),
  ).all<{ content: string }>()

  // 过滤字数达标
  const qualified = (results || []).filter((p) => calculateWordCount(p.content) >= MIN_WORDS)
  const publishedCount = qualified.length

  // 计算最后一篇文章距离现在的天数
  let daysSinceLastPost = 999
  if (results && results.length > 0) {
    // 用第一轮查询的原始数据再查一次 published_at
    const lastPost = await db.prepare(`
      SELECT published_at FROM posts
      WHERE status = 'published'
      ORDER BY published_at DESC
      LIMIT 1
    `).first<{ published_at: number }>()

    if (lastPost?.published_at) {
      const lastDate = new Date(lastPost.published_at * 1000)
      const diffMs = Date.now() - lastDate.getTime()
      daysSinceLastPost = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    }
  }

  return {
    weekStart,
    weekEnd,
    publishedCount,
    goal: WEEKLY_GOAL,
    met: publishedCount >= WEEKLY_GOAL,
    daysSinceLastPost,
  }
}

const SHAME_MESSAGES: Array<{
  cold: { title: string; subtitle: string }
  fierce: { title: string; subtitle: string }
  tease: { title: string; subtitle: string }
  data: { title: string; subtitle: string }
}> = [
  {
    cold: { title: '他又没写完。', subtitle: '不意外。' },
    fierce: { title: '就这？', subtitle: '一周写不出 5 篇你也配叫博主？' },
    tease: { title: '兄弟，你上周也是这么说的。', subtitle: '要不要看看上周的 flag 还在不在？' },
    data: { title: '上一篇发表于', subtitle: '天前。你在干嘛？' },
  },
  {
    cold: { title: '目标在那里，他没动。', subtitle: '习惯了。' },
    fierce: { title: '5 篇很难吗？', subtitle: '别人一天写一篇，你一周写不出来？' },
    tease: { title: '你是不是忘了自己有个博客？', subtitle: '它还记得你，你把它忘了。' },
    data: { title: '本周进度', subtitle: '篇 — 差的 5 篇会自己写完吗？' },
  },
  {
    cold: { title: '承诺是上周的事了。', subtitle: '结果呢？' },
    fierce: { title: '你写代码的时候可不是这样的。', subtitle: '一到写文章就开始拖？' },
    tease: { title: '说好的 Ship or Die 呢？', subtitle: '看来你选了 Die。' },
    data: { title: '距离上次更新已过', subtitle: '天。你的读者在等他。' },
  },
  {
    cold: { title: 'flag 立了又倒。', subtitle: '第几次了？' },
    fierce: { title: '你摘了那么多文章，倒是写啊。', subtitle: '收藏 != 学会，这话你比谁都清楚。' },
    tease: { title: '你的写作债又涨了。', subtitle: '利息按周计算。' },
    data: { title: '已欠', subtitle: '篇。这周还不还？' },
  },
  {
    cold: { title: '嘴上说要写。', subtitle: '事实上没有。' },
    fierce: { title: '你能不能说一句这周写不完我吃屎？', subtitle: '不敢？那就去写。' },
    tease: { title: '打开编辑器的次数：0。', subtitle: '打开 Twitter 的次数：47。' },
    data: { title: '本周写了 0 篇，摘了', subtitle: '篇。你的知识库越来越大，你的输出越来越小。' },
  },
  {
    cold: { title: '空白的一周。', subtitle: '又浪费了。' },
    fierce: { title: '你他妈倒是写啊！', subtitle: '没人替你做这件事。' },
    tease: { title: '如果写博客有段位，你现在的段位是：', subtitle: '「下周一定」。' },
    data: { title: '连续', subtitle: '周未达标。你确定这是你想做的事？' },
  },
  {
    cold: { title: '他说他想写博客。', subtitle: '但他没有。' },
    fierce: { title: '借口找够了没？', subtitle: '状态不好？没灵感？忙？都是屁话。' },
    tease: { title: '你的博客在等你。', subtitle: '它等得很久了。' },
    data: { title: '距离上次达成周目标已过', subtitle: '周。你退步了。' },
  },
]

function pickMessages(count: number): Array<{
  cold: { title: string; subtitle: string }
  fierce: { title: string; subtitle: string }
  tease: { title: string; subtitle: string }
  data: { title: string; subtitle: string }
}> {
  // 根据缺口数量选择更严厉的消息
  const deficit = Math.max(0, WEEKLY_GOAL - count)
  const severityIndex = Math.min(deficit, SHAME_MESSAGES.length - 1)

  // 选取 severityIndex 附近的 3 条，并随机一条
  const startIdx = Math.max(0, severityIndex - 2)
  const candidates = SHAME_MESSAGES.slice(startIdx, startIdx + 3)
  const pick = candidates[Math.floor(Math.random() * candidates.length)] || SHAME_MESSAGES[0]
  return [pick]
}

export function getShameMessages(stats: WeeklyWritingStats): ShameMessage[] {
  if (stats.met) return []

  const deficit = WEEKLY_GOAL - stats.publishedCount
  const allStyles = pickMessages(stats.publishedCount)

  // 随机选一种风格
  const styles = ['cold', 'fierce', 'tease', 'data'] as const
  const pickedStyle = styles[Math.floor(Math.random() * styles.length)]

  return allStyles.map((msg) => {
    const entry = msg[pickedStyle]
    let subtitle = entry.subtitle
      .replace('{count}', String(stats.publishedCount))
      .replace('{deficit}', String(deficit))
      .replace('{days}', String(stats.daysSinceLastPost))
      .replace('{goal}', String(WEEKLY_GOAL))

    // 数据风格特殊处理
    if (pickedStyle === 'data') {
      if (msg.data.title.includes('上一篇发表于')) {
        subtitle = `${stats.daysSinceLastPost}${subtitle}`
      } else if (msg.data.title.includes('本周进度')) {
        subtitle = `${stats.publishedCount}${subtitle}`
      } else if (msg.data.title.includes('距离上次更新已过')) {
        subtitle = `${stats.daysSinceLastPost}${subtitle}`
      } else if (msg.data.title.includes('已欠')) {
        subtitle = `${deficit}${subtitle}`
      } else if (msg.data.title.includes('本周写了 0 篇')) {
        subtitle = subtitle.replace('{count}', String(deficit))
      } else if (msg.data.title.includes('连续')) {
        subtitle = `${Math.ceil(stats.daysSinceLastPost / 7) || 1}${subtitle}`
      } else if (msg.data.title.includes('距离上次达成')) {
        subtitle = `${Math.ceil(stats.daysSinceLastPost / 7) || 1}${subtitle}`
      }
    }

    return {
      title: entry.title,
      subtitle,
      style: pickedStyle,
      severity: Math.min(deficit, 5),
    }
  })
}
