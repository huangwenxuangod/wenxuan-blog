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
    cold: { title: '你修 bug 的时候可不是这样的。', subtitle: '一晚上能肝到凌晨四点，写篇文章就要了你的命？' },
    fierce: { title: '你 debug 到凌晨 3 点不累，写 1000 字就累了？', subtitle: '骗谁呢？你不是没精力，你是不想做。' },
    tease: { title: '我赌 5 毛你这周还是写不完。', subtitle: '敢不敢让我输？' },
    data: { title: '连续写了', subtitle: '天代码。零篇文章。你真是个' },
  },
  {
    cold: { title: '你的代码库越来越大。', subtitle: '你的文章库一动不动。' },
    fierce: { title: '你能重构一个模块 3 遍，不能把一篇文章改 3 遍？', subtitle: '你的优先级有问题。' },
    tease: { title: '赌一顿饭，你这周还是 0 篇。', subtitle: '不敢赌就别看了，去写。' },
    data: { title: '本周写了 0 篇，commit 了', subtitle: '次。你是程序员还是博主？' },
  },
  {
    cold: { title: '你明明可以做得到。', subtitle: '但你选择了不做。' },
    fierce: { title: '你写代码的时候那种「这玩意儿我一定要搞定它」的劲去哪了？', subtitle: '写文章就不是工程问题了？' },
    tease: { title: '我赌你这篇还是不会开始写。', subtitle: '别证明我是对的。' },
    data: { title: '上一次写文章是', subtitle: '天前。你上一次写代码是今天。' },
  },
  {
    cold: { title: '又一周。', subtitle: '又没写。' },
    fierce: { title: '你写代码的时候可没说过「没灵感」。', subtitle: '写文章需要灵感，debug 就不需要？骗谁呢。' },
    tease: { title: '赌 10 块，你这周目标完不成。', subtitle: '我赢定了，但我希望你让我输。' },
    data: { title: '技术文章读了', subtitle: '篇。自己写的：0 篇。输入远大于输出。' },
  },
  {
    cold: { title: '你的读者在等你。', subtitle: '你在等 deadline。' },
    fierce: { title: '你解决一个 production issue 的速度以分钟计。', subtitle: '写一篇文章的速度以周计。你的能力没问题，你的态度有问题。' },
    tease: { title: '我赌你这周还是一篇都发不出来。', subtitle: '来，让我闭嘴。' },
    data: { title: '本周已过', subtitle: '天。写了 0 篇。你在等什么？' },
  },
  {
    cold: { title: '说到做到？', subtitle: '你上周也是这么说的。' },
    fierce: { title: '你能盯着一个 bug 看 6 个小时不眨眼。', subtitle: '写 1000 字需要你闭眼多久？' },
    tease: { title: '这周结束前你写不完 5 篇的。', subtitle: '我话放这了。证明我错了。' },
    data: { title: '离周日 24:00 还有', subtitle: '天。你猜你能写几篇？我猜 0。' },
  },
  {
    cold: { title: '你又逃避了。', subtitle: '不是第一次了。' },
    fierce: { title: '你写代码的时候那种一定要「跑通」的执念去哪了？', subtitle: '文章不需要跑通，只需要写完。这比 debug 简单多了。' },
    tease: { title: '赌 5 毛你等下会关掉这个页面去看 Twitter。', subtitle: '我太了解你了。' },
    data: { title: '你承诺了', subtitle: '次要写够 5 篇。实现了 0 次。信任余额不足。' },
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
