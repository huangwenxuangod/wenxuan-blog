import type { EditorAiRuntimeEvent } from '@/lib/ai-editor/runtime-types'

function encodeEvent(encoder: TextEncoder, event: EditorAiRuntimeEvent) {
  return encoder.encode(`${JSON.stringify(event)}\n`)
}

export function createEditorAiEventStream(events: Iterable<EditorAiRuntimeEvent> | AsyncIterable<EditorAiRuntimeEvent>) {
  const encoder = new TextEncoder()
  const isAsyncIterable = (value: typeof events): value is AsyncIterable<EditorAiRuntimeEvent> => (
    typeof value === 'object'
    && value !== null
    && Symbol.asyncIterator in value
  )

  return new ReadableStream({
    async start(controller) {
      if (isAsyncIterable(events)) {
        for await (const event of events) {
          controller.enqueue(encodeEvent(encoder, event))
        }
      } else {
        for (const event of events) {
          controller.enqueue(encodeEvent(encoder, event))

          if (event.type === 'assistant_delta') {
            await new Promise((resolve) => setTimeout(resolve, 12))
          }
        }
      }

      controller.close()
    },
  })
}

export async function collectEditorAiEventStream(stream: AsyncIterable<EditorAiRuntimeEvent>) {
  const events: EditorAiRuntimeEvent[] = []

  for await (const event of stream) {
    events.push(event)
  }

  return events
}

export function buildEditorAiTextEvents(payload: {
  message: string
  action?: unknown
  error?: string
}) {
  const events: EditorAiRuntimeEvent[] = [{ type: 'assistant_start' }]
  const text = String(payload.message || '')
  const chunkSize = 24

  for (let index = 0; index < text.length; index += chunkSize) {
    events.push({
      type: 'assistant_delta',
      delta: text.slice(index, index + chunkSize),
    })
  }

  if (payload.action) {
    events.push({
      type: 'action_ready',
      action: payload.action as never,
    })
  }

  events.push({
    type: 'assistant_done',
    message: text,
    action: (payload.action as never) || null,
    error: payload.error,
  })

  return events
}
