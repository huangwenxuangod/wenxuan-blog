export const EDITOR_TOC_WIDTH = 272
export const EDITOR_TOC_BREAKPOINT = 1280
export const EDITOR_AI_RAIL_BREAKPOINT = 1024
export const EDITOR_MIN_AI_RAIL_WIDTH = 320
export const EDITOR_MIN_CONTENT_WIDTH = 640

export function resolveEditorRailLayout(input: {
  viewportWidth: number
  tocPreferredOpen: boolean
  aiPreferredOpen: boolean
  aiPreferredWidth: number
}) {
  const tocVisible = input.tocPreferredOpen && input.viewportWidth >= EDITOR_TOC_BREAKPOINT
  const aiVisible = input.aiPreferredOpen && input.viewportWidth >= EDITOR_AI_RAIL_BREAKPOINT
  const leftInset = tocVisible ? EDITOR_TOC_WIDTH : 0
  const availableAiWidth = input.viewportWidth - leftInset - EDITOR_MIN_CONTENT_WIDTH
  const aiWidth = aiVisible
    ? Math.max(
        EDITOR_MIN_AI_RAIL_WIDTH,
        Math.min(input.aiPreferredWidth, availableAiWidth),
      )
    : 0

  return {
    tocVisible,
    aiVisible,
    aiWidth,
    leftInset,
    rightInset: aiVisible ? aiWidth : 0,
  }
}
