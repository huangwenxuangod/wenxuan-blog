export interface ParsedEditorToolCall {
  message: string
  toolName: string
  toolPayload: unknown
  parsed: boolean
}

export function parseStructuredEditorToolCall(rawArguments: string): ParsedEditorToolCall {
  try {
    const parsed = JSON.parse(rawArguments) as {
      message?: unknown
      tool?: {
        name?: unknown
        payload?: unknown
      } | null
      name?: unknown
      payload?: unknown
    }

    const nestedTool = parsed.tool && typeof parsed.tool === 'object'
      ? parsed.tool
      : null

    const toolNameSource = nestedTool?.name ?? parsed.name
    const toolPayloadSource = nestedTool?.payload ?? parsed.payload ?? null

    return {
      message: typeof parsed.message === 'string' ? parsed.message : '',
      toolName: typeof toolNameSource === 'string' ? toolNameSource : 'reply_only',
      toolPayload: toolPayloadSource,
      parsed: true,
    }
  } catch {
    return {
      message: rawArguments.trim(),
      toolName: 'reply_only',
      toolPayload: null,
      parsed: false,
    }
  }
}
