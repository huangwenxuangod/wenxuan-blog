'use client'

import { saveBlobFile } from '@/lib/client-download'
import { buildWechatExportCss, normalizeWechatExportHtml, type WechatExportStyleTokens } from './export-style'
import type { WechatStylePresetId } from './style-presets'
import type { IParagraphOptions, ParagraphChild } from 'docx'

type ExportMode = 'clipboard' | 'pdf'

type Html2PdfFactory = typeof import('html2pdf.js').default
type DocxModule = typeof import('docx')

const URL_ATTRIBUTES = [
  ['img', 'src'],
  ['a', 'href'],
  ['audio', 'src'],
  ['video', 'src'],
  ['source', 'src'],
  ['iframe', 'src'],
] as const

function shouldRewriteUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed || trimmed.startsWith('#')) return false
  if (/^(?:[a-z]+:|\/\/)/i.test(trimmed)) return false
  return true
}

function absolutizeUrls(root: Document | Element, baseUrl: string) {
  for (const [selector, attribute] of URL_ATTRIBUTES) {
    for (const element of root.querySelectorAll<HTMLElement>(selector)) {
      const value = element.getAttribute(attribute)
      if (!value || !shouldRewriteUrl(value)) continue
      element.setAttribute(attribute, new URL(value, baseUrl).toString())
    }
  }
}

function waitForLayout() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
}

async function waitForMediaReady(root: HTMLElement) {
  const imageTasks = Array.from(root.querySelectorAll<HTMLImageElement>('img'))
    .filter((img) => !img.complete)
    .map((img) => new Promise<void>((resolve) => {
      const cleanup = () => {
        img.removeEventListener('load', cleanup)
        img.removeEventListener('error', cleanup)
        resolve()
      }

      img.addEventListener('load', cleanup, { once: true })
      img.addEventListener('error', cleanup, { once: true })
    }))

  const fontsReady = typeof document.fonts?.ready?.then === 'function'
    ? document.fonts.ready.then(() => undefined).catch(() => undefined)
    : Promise.resolve()

  await Promise.all([fontsReady, ...imageTasks])
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function cleanAttributeValue(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, '')
}

function readCssVar(style: CSSStyleDeclaration, name: string, fallback: string) {
  const value = style.getPropertyValue(name)
  return value ? cleanAttributeValue(value) : fallback
}

function readWechatExportStyleTokens(): WechatExportStyleTokens {
  const rootStyle = window.getComputedStyle(document.documentElement)
  const bodyStyle = window.getComputedStyle(document.body)
  const bodyFont = readCssVar(rootStyle, '--body-font', bodyStyle.fontFamily || 'Arial, Helvetica, sans-serif')

  return {
    background: readCssVar(rootStyle, '--background', '#f5f4ed'),
    panelBackground: readCssVar(rootStyle, '--editor-panel', '#faf9f5'),
    softBackground: readCssVar(rootStyle, '--editor-soft', '#e8e6dc'),
    lineColor: readCssVar(rootStyle, '--editor-line', '#f0eee6'),
    inkColor: readCssVar(rootStyle, '--editor-ink', '#141413'),
    mutedColor: readCssVar(rootStyle, '--editor-muted', '#5e5d59'),
    accentColor: readCssVar(rootStyle, '--editor-accent', '#c96442'),
    linkColor: readCssVar(rootStyle, '--editor-link', '#c96442'),
    codeBackground: readCssVar(rootStyle, '--editor-code-bg', '#faf9f5'),
    codeBorderColor: readCssVar(rootStyle, '--editor-code-border', '#e8e6dc'),
    quoteBackground: readCssVar(rootStyle, '--editor-quote-bg', '#faf9f5'),
    articleHeadingColor: readCssVar(rootStyle, '--article-heading', '#17120d'),
    articleBodyColor: readCssVar(rootStyle, '--article-body', '#2b241c'),
    articleQuoteColor: readCssVar(rootStyle, '--article-quote', '#51473a'),
    articleQuoteBorderColor: readCssVar(rootStyle, '--article-quote-border', '#cdb796'),
    articleQuoteNestedBorderColor: readCssVar(rootStyle, '--article-quote-nested-border', '#b8a68a'),
    articleQuoteNestedBackground: readCssVar(rootStyle, '--article-quote-nested-bg', 'rgba(0, 0, 0, 0.02)'),
    bodyFontFamily: bodyFont,
    monoFontFamily: readCssVar(rootStyle, '--font-geist-mono', '"SFMono-Regular", Consolas, monospace'),
    titleFontFamily: bodyFont || 'Georgia, "Noto Serif SC", serif',
  }
}

function readWechatPreviewStyleTokens() {
  const tokens = readWechatExportStyleTokens()
  const rootStyle = window.getComputedStyle(document.documentElement)

  return {
    ...tokens,
    articleHeadingColor: readCssVar(rootStyle, '--preview-article-heading', tokens.articleHeadingColor),
    articleBodyColor: readCssVar(rootStyle, '--preview-article-body', tokens.articleBodyColor),
    articleQuoteColor: readCssVar(rootStyle, '--preview-article-quote', tokens.articleQuoteColor),
    articleQuoteBorderColor: readCssVar(rootStyle, '--preview-article-quote-border', tokens.articleQuoteBorderColor),
    articleQuoteNestedBorderColor: readCssVar(rootStyle, '--preview-article-quote-nested-border', tokens.articleQuoteNestedBorderColor),
    articleQuoteNestedBackground: readCssVar(rootStyle, '--preview-article-quote-nested-bg', tokens.articleQuoteNestedBackground),
    linkColor: readCssVar(rootStyle, '--preview-article-link', tokens.linkColor),
    inkColor: readCssVar(rootStyle, '--preview-ink', tokens.inkColor),
    mutedColor: readCssVar(rootStyle, '--preview-muted', tokens.mutedColor),
  }
}

function normalizeMediaAttributes(root: ParentNode) {
  for (const image of root.querySelectorAll<HTMLImageElement>('img')) {
    const width = image.getAttribute('width')
    const height = image.getAttribute('height')

    if (width) {
      image.removeAttribute('width')
      image.style.width = /^\d+$/.test(width) ? `${width}px` : width
    }

    if (height) {
      image.removeAttribute('height')
      image.style.height = /^\d+$/.test(height) ? `${height}px` : height
    }
  }
}

function normalizeCodeBlockMarkup(root: ParentNode) {
  for (const pre of root.querySelectorAll<HTMLPreElement>('pre')) {
    if (!pre.querySelector('code'))
      continue

    pre.classList.add('code__pre')
  }
}

function getMediaSource(element: Element) {
  if (element instanceof HTMLMediaElement) {
    return element.currentSrc || element.getAttribute('src') || ''
  }

  if (element instanceof HTMLIFrameElement) {
    return element.getAttribute('src') || ''
  }

  return (
    element.getAttribute('src')
    || element.querySelector('iframe')?.getAttribute('src')
    || element.querySelector('source')?.getAttribute('src')
    || ''
  )
}

function createPdfMediaPlaceholder(
  doc: Document,
  options: {
    href: string
    kind: 'video' | 'embed'
    title?: string
  },
) {
  const figure = doc.createElement('figure')
  figure.className = 'pdf-media-placeholder'
  figure.setAttribute('data-pdf-media-kind', options.kind)

  const poster = doc.createElement('div')
  poster.className = 'pdf-media-placeholder__poster'

  const play = doc.createElement('span')
  play.className = 'pdf-media-placeholder__play'
  play.textContent = '▶'
  poster.appendChild(play)

  const caption = doc.createElement('figcaption')
  caption.className = 'pdf-media-placeholder__caption'

  const title = doc.createElement('strong')
  title.className = 'pdf-media-placeholder__title'
  title.textContent = options.title?.trim() || (options.kind === 'video' ? '视频内容' : '嵌入内容')
  caption.appendChild(title)

  const description = doc.createElement('p')
  description.className = 'pdf-media-placeholder__description'
  description.textContent = options.kind === 'video'
    ? 'PDF 中无法直接播放视频，请打开下方链接查看。'
    : 'PDF 中无法直接展示该嵌入内容，请打开下方链接查看。'
  caption.appendChild(description)

  if (options.href) {
    const link = doc.createElement('a')
    link.className = 'pdf-media-placeholder__link'
    link.href = options.href
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.textContent = options.href
    caption.appendChild(link)
  }

  figure.appendChild(poster)
  figure.appendChild(caption)
  return figure
}

function replaceUnsupportedPdfEmbeds(doc: Document) {
  for (const youtube of Array.from(doc.querySelectorAll<HTMLElement>('div[data-youtube-video]'))) {
    const src = getMediaSource(youtube)
    youtube.replaceWith(createPdfMediaPlaceholder(doc, {
      href: src,
      kind: 'video',
      title: '嵌入视频',
    }))
  }

  for (const video of Array.from(doc.querySelectorAll<HTMLVideoElement>('video'))) {
    const src = getMediaSource(video)
    const title = video.getAttribute('title') || undefined
    video.replaceWith(createPdfMediaPlaceholder(doc, {
      href: src,
      kind: 'video',
      title,
    }))
  }

  for (const iframe of Array.from(doc.querySelectorAll<HTMLIFrameElement>('iframe'))) {
    const src = getMediaSource(iframe)
    iframe.replaceWith(createPdfMediaPlaceholder(doc, {
      href: src,
      kind: 'embed',
      title: iframe.getAttribute('title') || '嵌入内容',
    }))
  }
}

function normalizeExportMarkup(html: string, mode: ExportMode = 'clipboard') {
  const parser = new DOMParser()
  const doc = parser.parseFromString(normalizeWechatExportHtml(html), 'text/html')
  absolutizeUrls(doc, window.location.origin)
  normalizeMediaAttributes(doc)
  normalizeCodeBlockMarkup(doc)

  if (mode === 'pdf') {
    replaceUnsupportedPdfEmbeds(doc)
  }

  return doc.body.innerHTML
}

function buildWechatExportFragment(title: string, html: string) {
  return `
    <section class="wechat-export-root">
      <article class="wechat-export-article">
        <p class="wechat-export-title">${escapeHtml(title)}</p>
        <div class="wechat-export-content">${html}</div>
      </article>
    </section>
  `
}

function createStageRoot(title: string, html: string, css: string) {
  const stage = document.createElement('div')
  stage.style.position = 'fixed'
  stage.style.left = '-20000px'
  stage.style.top = '0'
  stage.style.width = '720px'
  stage.style.pointerEvents = 'none'
  stage.style.background = '#ffffff'
  stage.style.zIndex = '-1'

  stage.innerHTML = `
    <style>${css}</style>
    ${buildWechatExportFragment(title, html)}
  `

  document.body.appendChild(stage)
  return stage
}

async function prepareArticleExportStage(title: string, html: string, preset: WechatStylePresetId = 'default') {
  const normalizedTitle = title.trim() || '无标题'
  const normalizedHtml = normalizeExportMarkup(html, 'pdf')
  const css = buildWechatExportCss(readWechatExportStyleTokens(), preset)
  const stage = createStageRoot(normalizedTitle, normalizedHtml, css)
  const article = stage.querySelector('.wechat-export-article')

  if (!(article instanceof HTMLElement)) {
    stage.remove()
    throw new Error('生成导出内容失败')
  }

  await waitForLayout()
  await waitForMediaReady(stage)

  return {
    stage,
    article,
    normalizedTitle,
  }
}

async function buildWechatClipboardHtml(title: string, html: string, preset: WechatStylePresetId = 'default') {
  const normalizedTitle = title.trim() || '无标题'
  const normalizedHtml = normalizeExportMarkup(html, 'clipboard')
  const css = buildWechatExportCss(readWechatExportStyleTokens(), preset)
  const fragment = buildWechatExportFragment(normalizedTitle, normalizedHtml)

  const juice = (await import('juice')).default
  const exportedHtml = juice.inlineContent(fragment, css, {
    applyWidthAttributes: true,
    applyHeightAttributes: true,
    applyAttributesTableElements: true,
    preserveImportant: true,
    resolveCSSVariables: false,
    removeStyleTags: false,
  })

  return {
    exportedHtml,
    normalizedTitle,
  }
}

const DOCX_MAX_IMAGE_WIDTH = 520
const DOCX_MAX_IMAGE_HEIGHT = 1200

function getDocxHeadingLevel(tagName: string, docx: DocxModule) {
  switch (tagName.toLowerCase()) {
    case 'h1':
      return docx.HeadingLevel.HEADING_1
    case 'h2':
      return docx.HeadingLevel.HEADING_2
    case 'h3':
      return docx.HeadingLevel.HEADING_3
    case 'h4':
      return docx.HeadingLevel.HEADING_4
    case 'h5':
      return docx.HeadingLevel.HEADING_5
    case 'h6':
      return docx.HeadingLevel.HEADING_6
    default:
      return undefined
  }
}

function clampDocxImageSize(width: number, height: number) {
  if (!width || !height) {
    return {
      width: DOCX_MAX_IMAGE_WIDTH,
      height: Math.round(DOCX_MAX_IMAGE_WIDTH * 0.625),
    }
  }

  const widthScale = DOCX_MAX_IMAGE_WIDTH / width
  const heightScale = DOCX_MAX_IMAGE_HEIGHT / height
  const scale = Math.min(widthScale, heightScale, 1)

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function getImageType(mimeType: string) {
  if (mimeType.includes('png')) return 'png' as const
  if (mimeType.includes('gif')) return 'gif' as const
  if (mimeType.includes('bmp')) return 'bmp' as const
  return 'jpg' as const
}

async function readBlobDimensions(blob: Blob) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob)
    const dimensions = {
      width: bitmap.width,
      height: bitmap.height,
    }
    bitmap.close()
    return dimensions
  }

  const objectUrl = URL.createObjectURL(blob)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('图片尺寸读取失败'))
      img.src = objectUrl
    })

    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function buildDocxImageRun(
  image: HTMLImageElement,
  docx: DocxModule,
) {
  const src = image.getAttribute('src')?.trim()
  if (!src) return null

  const response = await fetch(src)
  if (!response.ok) {
    throw new Error(`图片下载失败: ${response.status}`)
  }

  const blob = await response.blob()
  const data = await blob.arrayBuffer()
  const dims = await readBlobDimensions(blob)
  const dimensions = clampDocxImageSize(dims.width, dims.height)

  return new docx.ImageRun({
    type: getImageType(blob.type || image.src),
    data,
    transformation: dimensions,
    altText: {
      title: image.alt || '图片',
      description: image.alt || '图片',
      name: image.alt || '图片',
    },
  })
}

type DocxInlineContext = {
  bold?: boolean
  italics?: boolean
  underline?: boolean
  code?: boolean
}

type DocxBlockContext = {
  quote?: boolean
}

function getDocxQuoteParagraphOptions(docx: DocxModule): Pick<IParagraphOptions, 'indent' | 'border'> {
  return {
    indent: { left: 360 },
    border: {
      left: {
        style: docx.BorderStyle.SINGLE,
        color: 'D0C8BA',
        size: 8,
        space: 12,
      },
    },
  }
}

function withDocxBlockContext(
  options: IParagraphOptions,
  context: DocxBlockContext,
  docx: DocxModule,
): IParagraphOptions {
  if (!context.quote) {
    return options
  }

  const quoteOptions = getDocxQuoteParagraphOptions(docx)
  const currentLeftIndent = Number(options.indent?.left ?? 0)
  const quoteLeftIndent = Number(quoteOptions.indent?.left ?? 0)

  return {
    ...options,
    indent: {
      ...options.indent,
      ...quoteOptions.indent,
      left: currentLeftIndent + quoteLeftIndent,
    },
    border: {
      ...options.border,
      ...quoteOptions.border,
    },
  }
}

function createDocxTextRun(
  text: string,
  context: DocxInlineContext,
  docx: DocxModule,
) {
  return new docx.TextRun({
    text,
    bold: context.bold,
    italics: context.italics,
    underline: context.underline ? {} : undefined,
    font: context.code ? 'Courier New' : undefined,
    size: context.code ? 20 : undefined,
  })
}

async function collectDocxInlineChildren(
  parent: ParentNode,
  docx: DocxModule,
  context: DocxInlineContext = {},
): Promise<ParagraphChild[]> {
  const children: ParagraphChild[] = []

  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.replace(/\u00a0/g, ' ') || ''
      if (text.trim()) {
        children.push(createDocxTextRun(text, context, docx))
      }
      continue
    }

    if (!(node instanceof HTMLElement)) {
      continue
    }

    const tagName = node.tagName.toLowerCase()

    if (tagName === 'br') {
      children.push(new docx.TextRun({ text: '', break: 1 }))
      continue
    }

    if (tagName === 'img') {
      try {
        const imageRun = await buildDocxImageRun(node as HTMLImageElement, docx)
        if (imageRun) {
          children.push(imageRun)
        }
      } catch {
        const fallbackText = node.getAttribute('alt')?.trim() || node.getAttribute('src')?.trim() || '图片'
        children.push(createDocxTextRun(`[图片] ${fallbackText}`, context, docx))
      }
      continue
    }

    const nextContext: DocxInlineContext = {
      bold: context.bold || ['strong', 'b'].includes(tagName),
      italics: context.italics || ['em', 'i'].includes(tagName),
      underline: context.underline || tagName === 'u',
      code: context.code || tagName === 'code',
    }

    const nestedChildren = await collectDocxInlineChildren(node, docx, nextContext)
    if (!nestedChildren.length) {
      continue
    }

    if (tagName === 'a') {
      const link = node.getAttribute('href')?.trim()
      if (link) {
        children.push(new docx.ExternalHyperlink({
          link,
          children: nestedChildren,
        }))
        continue
      }
    }

    children.push(...nestedChildren)
  }

  return children
}

async function convertDocxList(
  list: HTMLElement,
  docx: DocxModule,
  level = 0,
  context: DocxBlockContext = {},
): Promise<import('docx').Paragraph[]> {
  const paragraphs: import('docx').Paragraph[] = []
  const isOrdered = list.tagName.toLowerCase() === 'ol'
  const items = Array.from(list.children).filter((child): child is HTMLLIElement => child.tagName.toLowerCase() === 'li')

  for (const [index, item] of items.entries()) {
    const inlineContainer = document.createElement('div')
    const nestedLists: HTMLElement[] = []

    for (const child of Array.from(item.childNodes)) {
      if (child instanceof HTMLElement && ['ul', 'ol'].includes(child.tagName.toLowerCase())) {
        nestedLists.push(child)
        continue
      }

      inlineContainer.appendChild(child.cloneNode(true))
    }

    const inlineChildren = await collectDocxInlineChildren(inlineContainer, docx)
    if (inlineChildren.length) {
      paragraphs.push(new docx.Paragraph(withDocxBlockContext({
        children: isOrdered
          ? [createDocxTextRun(`${index + 1}. `, {}, docx), ...inlineChildren]
          : inlineChildren,
        bullet: isOrdered ? undefined : { level: Math.min(level, 8) },
        indent: isOrdered
          ? { left: 360 * (level + 1) }
          : undefined,
        spacing: { after: 120 },
      }, context, docx)))
    }

    for (const nestedList of nestedLists) {
      paragraphs.push(...await convertDocxList(nestedList, docx, level + 1, context))
    }
  }

  return paragraphs
}

async function convertDocxBlockElement(
  element: HTMLElement,
  docx: DocxModule,
  context: DocxBlockContext = {},
): Promise<import('docx').Paragraph[]> {
  const tagName = element.tagName.toLowerCase()

  if (['ul', 'ol'].includes(tagName)) {
    return convertDocxList(element, docx, 0, context)
  }

  if (tagName === 'hr') {
    return [
      new docx.Paragraph(withDocxBlockContext({
        thematicBreak: true,
        spacing: { before: 240, after: 240 },
      }, context, docx)),
    ]
  }

  if (tagName === 'pre') {
    const code = element.textContent?.replace(/\r\n/g, '\n').trimEnd() || ''
    if (!code) return []

    const lines = code.split('\n')
    const children: ParagraphChild[] = []
    lines.forEach((line, index) => {
      children.push(new docx.TextRun({
        text: line,
        font: 'Courier New',
        size: 20,
      }))
      if (index < lines.length - 1) {
        children.push(new docx.TextRun({ text: '', break: 1 }))
      }
    })

    return [
      new docx.Paragraph(withDocxBlockContext({
        children,
        spacing: { before: 160, after: 200 },
        indent: { left: 240, right: 120 },
        shading: {
          fill: 'F3F4F6',
        },
      }, context, docx)),
    ]
  }

  if (tagName === 'blockquote') {
    const paragraphs: import('docx').Paragraph[] = []
    const blockChildren = Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement)
    const quoteContext: DocxBlockContext = { ...context, quote: true }

    if (blockChildren.length > 0) {
      for (const child of blockChildren) {
        paragraphs.push(...await convertDocxBlockElement(child, docx, quoteContext))
      }
      return paragraphs
    }

    const children = await collectDocxInlineChildren(element, docx)
    return children.length ? [
      new docx.Paragraph(withDocxBlockContext({
        children,
        spacing: { before: 160, after: 200 },
      }, quoteContext, docx)),
    ] : []
  }

  if (tagName === 'figure' || tagName === 'div' || tagName === 'section' || tagName === 'article') {
    const paragraphs: import('docx').Paragraph[] = []
    const blockChildren = Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement)

    if (blockChildren.length > 0) {
      for (const child of blockChildren) {
        paragraphs.push(...await convertDocxBlockElement(child, docx, context))
      }
      return paragraphs
    }

    const children = await collectDocxInlineChildren(element, docx)
    return children.length ? [new docx.Paragraph(withDocxBlockContext({ children, spacing: { after: 180 } }, context, docx))] : []
  }

  if (tagName === 'table') {
    const rows = Array.from(element.querySelectorAll('tr'))
      .map((row) => Array.from(row.querySelectorAll('th,td')).map((cell) => cell.textContent?.trim() || '').filter(Boolean).join(' | '))
      .filter(Boolean)

    return rows.map((row) => new docx.Paragraph(withDocxBlockContext({
      children: [new docx.TextRun({ text: row, font: 'Courier New', size: 20 })],
      spacing: { after: 120 },
    }, context, docx)))
  }

  const children = await collectDocxInlineChildren(element, docx)
  if (!children.length) return []

  const heading = getDocxHeadingLevel(tagName, docx)

  const paragraphOptions: IParagraphOptions = {
    children,
    heading,
    spacing: heading
      ? { before: 280, after: 120 }
      : { after: 180 },
  }

  return [new docx.Paragraph(withDocxBlockContext(paragraphOptions, context, docx))]
}

async function buildDocxDocumentChildren(
  title: string,
  html: string,
  docx: DocxModule,
) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const contentRoot = doc.querySelector('.wechat-export-content') || doc.body
  const children: import('docx').Paragraph[] = [
    new docx.Paragraph({
      text: title,
      heading: docx.HeadingLevel.TITLE,
      spacing: { after: 240 },
    }),
  ]

  for (const node of Array.from(contentRoot.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim()
      if (text) {
        children.push(new docx.Paragraph({
          children: [new docx.TextRun(text)],
          spacing: { after: 180 },
        }))
      }
      continue
    }

    if (!(node instanceof HTMLElement)) {
      continue
    }

    children.push(...await convertDocxBlockElement(node, docx))
  }

  return children
}

type BridgeImageVariant = 'content' | 'cover'

function rewriteBridgeImageUrl(input: string, variant: BridgeImageVariant) {
  const url = new URL(input, window.location.origin)

  if (url.origin === window.location.origin && url.pathname.startsWith('/api/images/')) {
    if (variant === 'content') {
      url.searchParams.set('w', '1280')
      url.searchParams.set('q', '82')
      url.searchParams.set('format', 'jpeg')
    } else {
      url.searchParams.set('w', '560')
      url.searchParams.set('h', '315')
      url.searchParams.set('fit', 'cover')
      url.searchParams.set('q', '48')
      url.searchParams.set('format', 'jpeg')
    }
  }

  return url.toString()
}

function rewriteBridgeArticleHtml(exportedHtml: string) {
  const doc = new DOMParser().parseFromString(exportedHtml, 'text/html')

  for (const image of doc.querySelectorAll<HTMLImageElement>('img')) {
    const src = image.getAttribute('src')
    if (!src) continue
    image.setAttribute('src', rewriteBridgeImageUrl(src, 'content'))
  }

  return doc.body.innerHTML
}

export async function buildWechatBridgeArticleExport(
  title: string,
  html: string,
  preset: WechatStylePresetId = 'default',
) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('当前环境不支持公众号发布导出')
  }

  const { exportedHtml, normalizedTitle } = await buildWechatClipboardHtml(title, html, preset)

  return {
    normalizedTitle,
    exportedHtml: rewriteBridgeArticleHtml(exportedHtml),
  }
}

export function buildWechatPreviewHtml(
  title: string,
  html: string,
  preset: WechatStylePresetId = 'default',
) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('当前环境不支持公众号预览')
  }

  const normalizedTitle = title.trim() || '无标题'
  const normalizedHtml = normalizeExportMarkup(html, 'clipboard')
  const css = buildWechatExportCss(readWechatPreviewStyleTokens(), preset)
  const fragment = buildWechatExportFragment(normalizedTitle, normalizedHtml)

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(normalizedTitle)}</title>
    <style>
      :root {
        color-scheme: light;
      }

      body {
        margin: 0;
        background: #ffffff;
        color: #222222;
        font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      }

      .wechat-preview-shell {
        min-height: 100vh;
        box-sizing: border-box;
        padding: 0;
      }

      .wechat-preview-content {
        box-sizing: border-box;
        width: min(100%, 414px);
        margin: 0 auto;
        padding: 18px 16px 36px;
      }

      ${css}
    </style>
  </head>
  <body>
    <div class="wechat-preview-shell">
      <div class="wechat-preview-content">
        ${fragment}
      </div>
    </div>
  </body>
</html>`
}

export function buildWechatBridgeCoverImageUrl(input: string) {
  const normalized = input.trim()
  if (!normalized) return ''

  if (typeof window === 'undefined') {
    throw new Error('当前环境不支持封面图处理')
  }

  return rewriteBridgeImageUrl(normalized, 'cover')
}

export function extractFirstWechatBridgeCoverImageUrl(html: string) {
  if (typeof window === 'undefined') {
    throw new Error('当前环境不支持封面图处理')
  }

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const src = doc.querySelector('img')?.getAttribute('src') || ''
  return src ? rewriteBridgeImageUrl(src, 'cover') : ''
}

function copyUsingExecCommand(html: string, plainText: string) {
  return new Promise<void>((resolve, reject) => {
    const textarea = document.createElement('textarea')
    textarea.value = plainText
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    textarea.style.top = '0'
    textarea.style.opacity = '0'

    const handleCopy = (event: ClipboardEvent) => {
      event.preventDefault()
      event.clipboardData?.setData('text/html', html)
      event.clipboardData?.setData('text/plain', plainText)
    }

    document.body.appendChild(textarea)
    document.addEventListener('copy', handleCopy)
    textarea.select()

    try {
      const ok = document.execCommand('copy')
      if (!ok) {
        throw new Error('execCommand failed')
      }
      resolve()
    } catch (error) {
      reject(error instanceof Error ? error : new Error('复制失败'))
    } finally {
      document.removeEventListener('copy', handleCopy)
      textarea.remove()
    }
  })
}

async function writeClipboardHtml(html: string, plainText: string) {
  if (window.isSecureContext && navigator.clipboard?.write) {
    try {
      if (typeof ClipboardItem === 'undefined') {
        throw new TypeError('ClipboardItem is not supported in this browser.')
      }

      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
        }),
      ])
      return
    } catch {
      // fall through to legacy copy
    }
  }

  await copyUsingExecCommand(html, plainText)
}

export async function copyAsWechatArticleFormat(
  title: string,
  html: string,
  preset: WechatStylePresetId = 'default',
) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('当前环境不支持复制')
  }

  const { exportedHtml, normalizedTitle } = await buildWechatClipboardHtml(title, html, preset)
  const plainText = new DOMParser()
    .parseFromString(exportedHtml, 'text/html')
    .body.textContent?.trim() || normalizedTitle

  await writeClipboardHtml(exportedHtml, plainText)
}

export async function downloadArticleAsPdf(
  title: string,
  html: string,
  preset: WechatStylePresetId = 'default',
) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('当前环境不支持导出 PDF')
  }

  let prepared:
    | {
      stage: HTMLDivElement
      article: HTMLElement
      normalizedTitle: string
    }
    | undefined

  try {
    prepared = await prepareArticleExportStage(title, html, preset)
    const html2pdf = (await import('html2pdf.js')).default as Html2PdfFactory
    const pdfOptions = {
      margin: [16, 12, 16, 12],
      filename: `${prepared.normalizedTitle}.pdf`,
      image: { type: 'jpeg', quality: 0.96 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      },
      jsPDF: {
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait',
      },
      pagebreak: {
        mode: ['css', 'legacy'],
        avoid: ['img', 'pre', 'blockquote', 'table', 'figure', 'p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', '.pdf-media-placeholder'],
      },
    }

    // html2pdf.js runtime supports `pagebreak`, but its bundled d.ts omits it.
    const pdfBlob = await html2pdf()
      .set(pdfOptions as never)
      .from(prepared.article)
      .outputPdf('blob')

    await saveBlobFile(pdfBlob as Blob, `${prepared.normalizedTitle}.pdf`, {
      types: [
        {
          description: 'PDF Document',
          accept: {
            'application/pdf': ['.pdf'],
          },
        },
      ],
    })
  } finally {
    prepared?.stage.remove()
  }
}

export async function downloadArticleAsDocx(
  title: string,
  html: string,
  preset: WechatStylePresetId = 'default',
) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('当前环境不支持导出 DOCX')
  }

  const normalizedTitle = title.trim() || '无标题'
  const normalizedHtml = normalizeExportMarkup(html, 'clipboard')
  const css = buildWechatExportCss(readWechatExportStyleTokens(), preset)
  const fragment = buildWechatExportFragment(normalizedTitle, normalizedHtml)
  const exportedHtml = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <style>${css}</style>
  </head>
  <body>${fragment}</body>
</html>`

  const docx = await import('docx')
  const children = await buildDocxDocumentChildren(normalizedTitle, exportedHtml, docx)
  const documentFile = new docx.Document({
    sections: [
      {
        children,
      },
    ],
  })

  const blob = await docx.Packer.toBlob(documentFile)
  await saveBlobFile(blob, `${normalizedTitle}.docx`, {
    types: [
      {
        description: 'Word Document',
        accept: {
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
        },
      },
    ],
  })
}
