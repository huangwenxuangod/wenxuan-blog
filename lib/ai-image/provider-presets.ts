export type AIImageProviderCategory = '官方' | '自定义兼容'

export interface AIImageProviderPreset {
  id: string
  name: string
  providerType: 'openai_images'
  category: AIImageProviderCategory
  baseUrl: string
  defaultModel: string
  quickModels: string[]
  apiKeyUrl?: string
  description: string
  recommended?: boolean
}

export const AI_IMAGE_PROVIDER_PRESETS: AIImageProviderPreset[] = [
  {
    id: 'workers_ai',
    name: 'Cloudflare Workers AI',
    providerType: 'openai_images',
    category: '官方',
    baseUrl: 'https://api.cloudflare.com/client/v4/accounts/【您的ACCOUNT_ID】/ai/run/',
    defaultModel: '@cf/black-forest-labs/flux-1-schnell',
    quickModels: [
      '@cf/black-forest-labs/flux-1-schnell',
      '@cf/bytedance/stable-diffusion-xl-lightning',
      '@cf/stabilityai/stable-diffusion-xl-base-1.0',
      '@cf/lykon/dreamshaper-8-lcm',
    ],
    apiKeyUrl: 'https://dash.cloudflare.com/',
    description: 'Cloudflare 官方 Workers AI 边缘端生图接口（每日含免费额度）',
    recommended: true,
  },
  {
    id: 'openai',
    name: 'OpenAI Images',
    providerType: 'openai_images',
    category: '官方',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-image-1',
    quickModels: ['gpt-image-1', 'gpt-image-1-mini', 'dall-e-3'],
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    description: 'OpenAI 官方文生图接口',
    recommended: true,
  },
  {
    id: 'doubao',
    name: '火山方舟',
    providerType: 'openai_images',
    category: '自定义兼容',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'ep-20250916145609-9bqzl',
    quickModels: ['ep-20250916145609-9bqzl', 'doubao-seedream-4-0-250828'],
    apiKeyUrl: 'https://www.volcengine.com/experience/ark',
    description: '豆包 / 火山引擎 OpenAI 兼容生图接口',
  },
]

export const AI_IMAGE_PROVIDER_MAP = Object.fromEntries(
  AI_IMAGE_PROVIDER_PRESETS.map((preset) => [preset.id, preset]),
) as Record<string, AIImageProviderPreset>

export const AI_IMAGE_PROVIDER_CATEGORIES: AIImageProviderCategory[] = ['官方', '自定义兼容']
