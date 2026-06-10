export type AIProviderCategory = '海外大模型' | '海外聚合' | '国内大模型' | '国内聚合'

export interface AIProviderPreset {
  id: string
  name: string
  providerType: 'openai_compatible' | 'anthropic'
  category: AIProviderCategory
  baseUrl: string
  defaultModel: string
  quickModels: string[]
  apiKeyUrl?: string
  description: string
  recommended?: boolean
}

export const AI_PROVIDER_PRESETS: AIProviderPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    providerType: 'openai_compatible',
    category: '海外大模型',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    quickModels: ['gpt-4o-mini', 'gpt-4o', 'o3-mini'],
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    description: 'OpenAI 官方接口',
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    providerType: 'anthropic',
    category: '海外大模型',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
    quickModels: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022'],
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    description: 'Anthropic 官方接口',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    providerType: 'openai_compatible',
    category: '国内大模型',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-v4-flash',
    quickModels: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    description: 'DeepSeek 官方接口，适合中文写作与推理任务',
    recommended: true,
  },
  {
    id: 'moonshot',
    name: 'Kimi (Moonshot)',
    providerType: 'openai_compatible',
    category: '国内大模型',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    quickModels: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
    description: '月之暗面 Kimi',
  },
  {
    id: 'zhipu',
    name: '智谱',
    providerType: 'openai_compatible',
    category: '国内大模型',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-plus',
    quickModels: ['glm-4-plus', 'glm-4-flash'],
    apiKeyUrl: 'https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys',
    description: '智谱 GLM 系列',
    recommended: true,
  },
  {
    id: 'qwen',
    name: '阿里百炼',
    providerType: 'openai_compatible',
    category: '国内大模型',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-max',
    quickModels: ['qwen-max', 'qwen-plus', 'qwen-turbo'],
    apiKeyUrl: 'https://bailian.console.aliyun.com/?tab=model#/api-key',
    description: '通义千问',
    recommended: true,
  },
  {
    id: 'doubao',
    name: '火山方舟',
    providerType: 'openai_compatible',
    category: '国内大模型',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'ep-20250616135538-zdz4b',
    quickModels: ['ep-20250616135538-zdz4b'],
    apiKeyUrl: 'https://www.volcengine.com/experience/ark',
    description: '豆包 / 火山引擎',
  },
  {
    id: 'workers_ai',
    name: 'Cloudflare Workers AI',
    providerType: 'openai_compatible',
    category: '海外大模型',
    baseUrl: 'https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/ai/v1',
    defaultModel: '@cf/meta/llama-3.1-8b-instruct',
    quickModels: [
      '@cf/meta/llama-3.1-8b-instruct',
      '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      '@cf/openai/gpt-oss-120b',
      '@cf/openai/gpt-oss-20b',
      '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
    ],
    apiKeyUrl: 'https://dash.cloudflare.com/profile/api-tokens',
    description: 'Cloudflare 官方 Workers AI。使用 API Token，Base URL 里的 <ACCOUNT_ID> 需替换为你的账号 ID。',
  },
]

export const AI_PROVIDER_MAP = Object.fromEntries(
  AI_PROVIDER_PRESETS.map(preset => [preset.id, preset]),
) as Record<string, AIProviderPreset>

export const AI_PROVIDER_CATEGORIES: AIProviderCategory[] = [
  '海外大模型',
  '海外聚合',
  '国内大模型',
  '国内聚合',
]
