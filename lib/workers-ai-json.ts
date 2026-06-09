type JsonSchema =
  | {
      type?: string
      properties?: Record<string, JsonSchema>
      items?: JsonSchema
      enum?: string[]
      required?: string[]
      additionalProperties?: boolean
    }
  | Record<string, unknown>

export function buildWorkersAiJsonSchemaResponseFormat(jsonSchema: JsonSchema) {
  return {
    type: 'json_schema' as const,
    json_schema: jsonSchema,
  }
}

export function buildEditorAgentResponseSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['message', 'tool'],
    properties: {
      message: {
        type: 'string',
      },
      tool: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'payload'],
        properties: {
          name: {
            type: 'string',
            enum: ['reply_only', 'edit_title', 'edit_selection', 'insert_block', 'generate_image'],
          },
          payload: {},
        },
      },
    },
  }
}

export function buildPostProcessResponseSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['category', 'description', 'tags'],
    properties: {
      category: { type: 'string' },
      description: { type: 'string' },
      tags: {
        type: 'array',
        items: { type: 'string' },
      },
    },
  }
}

export function buildPostMetadataResponseSchema(target: 'summary' | 'tags' | 'slug') {
  if (target === 'summary') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['summary'],
      properties: {
        summary: { type: 'string' },
      },
    }
  }

  if (target === 'tags') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['tags'],
      properties: {
        tags: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    }
  }

  return {
    type: 'object',
    additionalProperties: false,
    required: ['slug'],
    properties: {
      slug: { type: 'string' },
    },
  }
}
