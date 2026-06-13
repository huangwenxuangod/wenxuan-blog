import type { WechatStylePresetId } from './style-presets'

export interface WechatExportStyleTokens {
  background: string
  panelBackground: string
  softBackground: string
  lineColor: string
  inkColor: string
  mutedColor: string
  accentColor: string
  linkColor: string
  codeBackground: string
  codeBorderColor: string
  quoteBackground: string
  articleHeadingColor: string
  articleBodyColor: string
  articleQuoteColor: string
  articleQuoteBorderColor: string
  articleQuoteNestedBorderColor: string
  articleQuoteNestedBackground: string
  bodyFontFamily: string
  monoFontFamily: string
  titleFontFamily: string
}

function stripEditorOnlyBreaks(html: string) {
  return html.replace(/\s*<br\b[^>]*class="[^"]*ProseMirror-trailingBreak[^"]*"[^>]*>\s*/gi, '')
}

export function normalizeWechatExportHtml(html: string) {
  return stripEditorOnlyBreaks(html)
    .replace(/<p(?:\s[^>]*)?>\s*(?:<br\b[^>]*>)?\s*<\/p>/gi, '<p data-wechat-empty="true">&nbsp;</p>')
    .replace(/<p(?![^>]*data-wechat-empty="true")([^>]*)>\s*&nbsp;\s*<\/p>/gi, '<p$1 data-wechat-empty="true">&nbsp;</p>')
}

function buildPresetCss(tokens: WechatExportStyleTokens, preset: WechatStylePresetId) {
  switch (preset) {
    case 'claude':
      return `
.wechat-export-article {
  padding: 0;
}

.wechat-export-title {
  margin: 0 0 1.2em;
  color: ${tokens.articleHeadingColor};
  font-size: 1.02rem;
  font-weight: 600;
  line-height: 1.62;
  letter-spacing: 0;
}

.wechat-export-content {
  font-size: 16px;
  line-height: 1.86;
}

.wechat-export-content h1,
.wechat-export-content h2,
.wechat-export-content h3,
.wechat-export-content h4,
.wechat-export-content h5,
.wechat-export-content h6 {
  margin: 1.65em 0 0.72em;
  color: ${tokens.articleHeadingColor};
  font-weight: 650;
  line-height: 1.32;
}

.wechat-export-content h1 { font-size: 1.3rem; }
.wechat-export-content h2 { font-size: 1.16rem; }
.wechat-export-content h3 { font-size: 1.04rem; }

.wechat-export-content p {
  margin: 1.16em 0;
  letter-spacing: 0;
}

.wechat-export-content blockquote {
  margin: 1.2em 0;
  padding: 0.02em 0 0.02em 0.95em;
  border-left: 2px solid color-mix(in srgb, ${tokens.articleQuoteBorderColor} 52%, transparent);
  color: ${tokens.articleQuoteColor};
  background: transparent;
}

.wechat-export-content hr {
  margin: 1.45em 0;
  border-color: rgba(0, 0, 0, 0.08);
}
`.trim()
    case 'nyt':
      return `
.wechat-export-article {
  padding: 0 6px;
}

.wechat-export-title {
  margin: 0 0 1.6em;
  color: ${tokens.articleHeadingColor};
  font-family: ${tokens.titleFontFamily};
  font-size: 1.12rem;
  font-weight: 700;
  line-height: 1.72;
  letter-spacing: 0.01em;
}

.wechat-export-content {
  font-size: 16px;
  line-height: 1.95;
}

.wechat-export-content h1,
.wechat-export-content h2,
.wechat-export-content h3,
.wechat-export-content h4,
.wechat-export-content h5,
.wechat-export-content h6 {
  margin: 2.1em 0 0.85em;
  color: ${tokens.articleHeadingColor};
  font-family: ${tokens.titleFontFamily};
  font-weight: 700;
  line-height: 1.28;
}

.wechat-export-content h1 { font-size: 1.5rem; }
.wechat-export-content h2 { font-size: 1.3rem; }
.wechat-export-content h3 { font-size: 1.14rem; }

.wechat-export-content p {
  margin: 1.5em 0;
  letter-spacing: 0;
}

.wechat-export-content blockquote {
  margin: 1.45em 0;
  padding: 0.35em 1em;
  border-left: 3px solid ${tokens.articleQuoteBorderColor};
  background: ${tokens.articleQuoteNestedBackground};
  color: ${tokens.articleQuoteColor};
  border-radius: 0 10px 10px 0;
}

.wechat-export-content hr {
  margin: 2em 0 1.75em;
  width: 100%;
  border-color: rgba(0, 0, 0, 0.18);
  transform: none;
}
`.trim()
    case 'financial-times':
      return `
.wechat-export-article {
  padding: 0 8px;
}

.wechat-export-title {
  margin: 0 0 1.45em;
  color: ${tokens.articleHeadingColor};
  font-family: ${tokens.titleFontFamily};
  font-size: 1.08rem;
  font-weight: 700;
  line-height: 1.68;
  letter-spacing: 0.02em;
}

.wechat-export-content {
  font-size: 16px;
  line-height: 1.82;
}

.wechat-export-content h1,
.wechat-export-content h2,
.wechat-export-content h3,
.wechat-export-content h4,
.wechat-export-content h5,
.wechat-export-content h6 {
  margin: 1.9em 0 0.72em;
  color: ${tokens.articleHeadingColor};
  font-weight: 700;
  line-height: 1.3;
}

.wechat-export-content h1,
.wechat-export-content h2 {
  padding-bottom: 0.42em;
  border-bottom: 1px solid color-mix(in srgb, ${tokens.articleQuoteBorderColor} 54%, transparent);
}

.wechat-export-content h1 { font-size: 1.34rem; }
.wechat-export-content h2 { font-size: 1.18rem; }
.wechat-export-content h3 { font-size: 1.06rem; }

.wechat-export-content p {
  margin: 1.28em 0;
  letter-spacing: 0;
}

.wechat-export-content blockquote {
  margin: 1.32em 0;
  padding: 0.15em 0 0.15em 1em;
  border-left: 3px solid ${tokens.articleQuoteBorderColor};
  color: ${tokens.articleQuoteColor};
  background: transparent;
}

.wechat-export-content hr {
  margin: 1.7em 0;
  border-color: color-mix(in srgb, ${tokens.articleQuoteBorderColor} 44%, transparent);
}
`.trim()
    case 'bold':
      return `
.wechat-export-article {
  padding: 0 4px;
}

.wechat-export-title {
  margin: 0 0 1.3em;
  color: ${tokens.articleHeadingColor};
  font-size: 1.06rem;
  font-weight: 700;
  line-height: 1.65;
  letter-spacing: 0.02em;
}

.wechat-export-content {
  font-size: 16px;
  line-height: 1.82;
}

.wechat-export-content h1,
.wechat-export-content h2,
.wechat-export-content h3,
.wechat-export-content h4,
.wechat-export-content h5,
.wechat-export-content h6 {
  margin: 1.8em 0 0.85em;
  color: ${tokens.articleHeadingColor};
  font-weight: 800;
  line-height: 1.35;
}

.wechat-export-content h1,
.wechat-export-content h2 {
  position: relative;
  padding-left: 0.8em;
}

.wechat-export-content h1::before,
.wechat-export-content h2::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0.2em;
  width: 0.26em;
  height: 1.05em;
  border-radius: 999px;
  background: ${tokens.accentColor};
}

.wechat-export-content h1 { font-size: 1.44rem; }
.wechat-export-content h2 { font-size: 1.24rem; }
.wechat-export-content h3 { font-size: 1.1rem; }

.wechat-export-content p {
  margin: 1.3em 0;
}

.wechat-export-content blockquote {
  margin: 1.45em 0;
  padding: 0.45em 1em;
  border-left: 4px solid ${tokens.accentColor};
  background: color-mix(in srgb, ${tokens.accentColor} 8%, transparent);
  color: ${tokens.articleQuoteColor};
}
`.trim()
    case 'default':
    default:
      return `
.wechat-export-article {
  padding: 0 8px;
}

.wechat-export-title {
  margin: 0 0 1.45em;
  color: ${tokens.articleBodyColor};
  font-family: ${tokens.bodyFontFamily};
  font-size: 17px;
  font-weight: 400;
  line-height: 1.78;
  letter-spacing: 0.03em;
}

.wechat-export-content {
  color: ${tokens.articleBodyColor};
  font-family: ${tokens.bodyFontFamily};
  font-size: 17px;
  line-height: 1.78;
}

.wechat-export-content h1,
.wechat-export-content h2,
.wechat-export-content h3,
.wechat-export-content h4,
.wechat-export-content h5,
.wechat-export-content h6 {
  margin: 1.9em 0 0.8em;
  color: ${tokens.articleHeadingColor};
  font-weight: 700;
  line-height: 1.4;
}

.wechat-export-content h1 { font-size: 1.4rem; }
.wechat-export-content h2 { font-size: 1.24rem; }
.wechat-export-content h3 { font-size: 1.12rem; }
.wechat-export-content h4,
.wechat-export-content h5,
.wechat-export-content h6 {
  font-size: 1rem;
}

.wechat-export-content p {
  margin: 1.45em 0;
  color: inherit;
  letter-spacing: 0;
}

.wechat-export-content blockquote {
  margin: 1.4em 0;
  padding: 0.2em 0 0.2em 1em;
  border-left: 3px solid ${tokens.articleQuoteBorderColor};
  background: transparent;
  color: ${tokens.articleQuoteColor};
}
`.trim()
  }
}

export function buildWechatExportCss(tokens: WechatExportStyleTokens, preset: WechatStylePresetId = 'default') {
  return `
.wechat-export-root {
  color: ${tokens.articleBodyColor};
  font-family: ${tokens.bodyFontFamily};
  background: transparent;
}

.wechat-export-article,
.wechat-export-title,
.wechat-export-content {
  color: ${tokens.articleBodyColor};
  font-family: ${tokens.bodyFontFamily};
}

.wechat-export-article {
  box-sizing: border-box;
}

.wechat-export-content {
  word-break: normal;
  overflow-wrap: break-word;
}

.wechat-export-content > :first-child {
  margin-top: 0;
}

.wechat-export-content > :last-child {
  margin-bottom: 0;
}

${buildPresetCss(tokens, preset)}

.wechat-export-title,
.wechat-export-content h1,
.wechat-export-content h2,
.wechat-export-content h3,
.wechat-export-content h4,
.wechat-export-content h5,
.wechat-export-content h6,
.wechat-export-content p,
.wechat-export-content ul,
.wechat-export-content ol,
.wechat-export-content li,
.wechat-export-content blockquote,
.wechat-export-content pre,
.wechat-export-content table,
.wechat-export-content figure,
.wechat-export-content .pdf-media-placeholder {
  break-inside: avoid-page;
  page-break-inside: avoid;
}

.wechat-export-content p {
  color: inherit;
  orphans: 3;
  widows: 3;
  text-align: left;
  text-align-last: auto;
  text-justify: auto;
  word-break: normal;
  overflow-wrap: break-word;
  white-space: normal;
}

.wechat-export-content p[data-wechat-empty="true"] {
  margin: 0.8em 0;
  line-height: 1;
  font-size: 0.92em;
  letter-spacing: 0;
}

.wechat-export-content li p,
.wechat-export-content blockquote p,
.wechat-export-content td p,
.wechat-export-content th p {
  margin: 0.45em 0;
  letter-spacing: inherit;
}

.wechat-export-content a {
  color: #576b95;
  text-decoration: none;
  word-break: break-all;
  overflow-wrap: break-word;
}

.wechat-export-content ul,
.wechat-export-content ol {
  margin: 1.2em 0;
  padding-left: 1em;
  color: inherit;
}

.wechat-export-content ul { list-style: circle; }
.wechat-export-content ol { list-style: decimal; }

.wechat-export-content li {
  display: block;
  margin: 0.2em 0;
  color: inherit;
}

.wechat-export-content blockquote {
  font-style: normal;
}

.wechat-export-content blockquote > :first-child {
  margin-top: 0;
}

.wechat-export-content blockquote > :last-child {
  margin-bottom: 0;
}

.wechat-export-content blockquote blockquote {
  margin: 0.8em 0 0;
  padding-left: 0.9em;
  border-left-color: ${tokens.articleQuoteNestedBorderColor};
  background: transparent;
}

.wechat-export-content table {
  width: 100%;
  max-width: 100%;
  margin: 1.4em 0;
  border-collapse: collapse;
  border-spacing: 0;
  color: inherit;
}

.wechat-export-content table th,
.wechat-export-content table td {
  padding: 0.25em 0.5em;
  border: 1px solid #dfdfdf;
  text-align: left;
  vertical-align: top;
  word-break: keep-all;
}

.wechat-export-content table th {
  background: rgba(0, 0, 0, 0.05);
  color: inherit;
  font-weight: 600;
}

.wechat-export-content figure {
  margin: 1.5em 0;
}

.wechat-export-content figcaption {
  margin-top: 0.6em;
  color: #888888;
  font-size: 0.82em;
  text-align: center;
}

.wechat-export-content hr {
  border-style: solid;
  border-width: 1px 0 0;
  border-color: rgba(0, 0, 0, 0.12);
  transform-origin: 0 0;
  transform: scale(1, 0.5);
  height: 0.4em;
  margin: 1.5em 0;
}

.wechat-export-content code {
  font-size: 90%;
  color: #d14;
  background: rgba(27, 31, 35, 0.05);
  padding: 3px 5px;
  border: 0;
  border-radius: 4px;
  font-family: ${tokens.monoFontFamily};
  word-break: break-word;
}

.wechat-export-content pre.code__pre,
.wechat-export-content .hljs.code__pre,
.wechat-export-content pre {
  margin: 10px 0;
  font-size: 90%;
  overflow-x: auto;
  padding: 0 !important;
  border-radius: 8px;
  background: transparent;
  line-height: 1.5;
}

.wechat-export-content pre.code__pre > code,
.wechat-export-content .hljs.code__pre > code,
.wechat-export-content pre > code {
  display: -webkit-box;
  padding: 0.5em 1em 1em;
  overflow-x: auto;
  text-indent: 0;
  color: inherit;
  background: none;
  white-space: nowrap;
  margin: 0;
  font-family: ${tokens.monoFontFamily};
  font-size: inherit;
  line-height: inherit;
}

.wechat-export-content .pdf-media-placeholder {
  margin: 1.5em 0;
}

.wechat-export-content .pdf-media-placeholder__poster {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  border-radius: 14px;
  background: linear-gradient(180deg, #3a3a3a 0%, #232323 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.wechat-export-content .pdf-media-placeholder__play {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  color: #ffffff;
  font-size: 28px;
  line-height: 1;
}

.wechat-export-content .pdf-media-placeholder__caption {
  margin-top: 0.8em;
}

.wechat-export-content .pdf-media-placeholder__title {
  display: block;
  margin: 0;
  color: ${tokens.articleHeadingColor};
  font-size: 0.98em;
}

.wechat-export-content .pdf-media-placeholder__description {
  margin: 0.45em 0 0;
  color: ${tokens.articleQuoteColor};
  font-size: 0.92em;
  letter-spacing: 0;
}

.wechat-export-content .pdf-media-placeholder__link {
  display: block;
  margin-top: 0.55em;
  font-size: 0.88em;
  word-break: break-all;
}

.wechat-export-content img,
.wechat-export-content video {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0.1em auto 0.5em;
  border-radius: 4px;
}

.wechat-export-content img + img,
.wechat-export-content img + video,
.wechat-export-content video + img,
.wechat-export-content video + video {
  margin-top: 12px;
}

.wechat-export-content img + p,
.wechat-export-content img + ul,
.wechat-export-content img + ol,
.wechat-export-content img + blockquote,
.wechat-export-content img + pre,
.wechat-export-content img + table,
.wechat-export-content video + p,
.wechat-export-content video + ul,
.wechat-export-content video + ol,
.wechat-export-content video + blockquote,
.wechat-export-content video + pre,
.wechat-export-content video + table {
  margin-top: 1.7em;
}

.wechat-export-content audio {
  display: block;
  width: 100%;
  max-width: 100%;
  margin: 1em 0;
}

.wechat-export-content ul[data-type="taskList"] {
  list-style: none;
  padding-left: 0;
}

.wechat-export-content ul[data-type="taskList"] li {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  margin: 0.6em 0;
}

.wechat-export-content ul[data-type="taskList"] li > label {
  margin-top: 0.2rem;
}

.wechat-export-content ul[data-type="taskList"] li > div {
  flex: 1;
}

.wechat-export-content ul[data-type="taskList"] input[type="checkbox"] {
  width: 1rem;
  height: 1rem;
  accent-color: ${tokens.accentColor};
}
`.trim()
}
