export type WechatStylePresetId =
  | 'default'
  | 'claude'
  | 'nyt'
  | 'financial-times'
  | 'bold'

export interface WechatStylePresetOption {
  id: WechatStylePresetId
  label: string
  description: string
}

export const WECHAT_STYLE_STORAGE_KEY = 'qmblog:wechat-style-preset'

export const WECHAT_STYLE_PRESET_OPTIONS: WechatStylePresetOption[] = [
  {
    id: 'default',
    label: 'Default',
    description: '均衡稳妥的默认公众号风格，适合大多数文章。',
  },
  {
    id: 'claude',
    label: 'Claude',
    description: '参考 Anthropic Claude / Apple 极简方向，更安静、更轻、更克制。',
  },
  {
    id: 'nyt',
    label: 'New York Times',
    description: '更像杂志与长文报道，标题和段落节奏更鲜明。',
  },
  {
    id: 'financial-times',
    label: 'Financial Times',
    description: '更偏财经媒体排版，结构严谨，标题与分隔更克制但更专业。',
  },
  {
    id: 'bold',
    label: 'Bold',
    description: '标题与重点更醒目的强调型排版，适合观点和发布内容。',
  },
]

export function normalizeWechatStylePreset(value: string | null | undefined): WechatStylePresetId {
  switch (value) {
    case 'default':
    case 'claude':
    case 'nyt':
    case 'financial-times':
    case 'bold':
      return value
    default:
      return 'default'
  }
}
