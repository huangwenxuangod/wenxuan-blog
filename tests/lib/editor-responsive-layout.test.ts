import { describe, expect, it } from 'vitest'
import { resolveEditorRailLayout } from '@/lib/editor-responsive-layout'

describe('editor responsive rail layout', () => {
  it('keeps all three columns on wide screens and reserves their space', () => {
    expect(resolveEditorRailLayout({
      viewportWidth: 1440,
      tocPreferredOpen: true,
      aiPreferredOpen: true,
      aiPreferredWidth: 372,
    })).toEqual({
      tocVisible: true,
      aiVisible: true,
      aiWidth: 372,
      leftInset: 272,
      rightInset: 372,
    })
  })

  it('hides the toc at medium desktop widths so the editor is not squeezed', () => {
    expect(resolveEditorRailLayout({
      viewportWidth: 1160,
      tocPreferredOpen: true,
      aiPreferredOpen: true,
      aiPreferredWidth: 372,
    })).toEqual({
      tocVisible: false,
      aiVisible: true,
      aiWidth: 372,
      leftInset: 0,
      rightInset: 372,
    })
  })

  it('hides both rails below the desktop breakpoint without changing preferences', () => {
    expect(resolveEditorRailLayout({
      viewportWidth: 900,
      tocPreferredOpen: true,
      aiPreferredOpen: true,
      aiPreferredWidth: 500,
    })).toEqual({
      tocVisible: false,
      aiVisible: false,
      aiWidth: 0,
      leftInset: 0,
      rightInset: 0,
    })
  })

  it('shrinks an oversized AI rail to preserve the minimum editor width', () => {
    expect(resolveEditorRailLayout({
      viewportWidth: 1280,
      tocPreferredOpen: true,
      aiPreferredOpen: true,
      aiPreferredWidth: 640,
    }).aiWidth).toBe(368)
  })
})
