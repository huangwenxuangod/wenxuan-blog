import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

type ExtractSuccess = {
  success: true;
  title: string;
  markdown: string;
  images: string[];
  url: string;
}

type ExtractFailure = {
  success: false;
  error: string;
}

type TranscriptSegment = {
  startMs: number;
  durationMs?: number;
  text: string;
};

type SubtitleCandidate = {
  url: string;
  language?: string;
  label?: string;
  isAuto?: boolean;
};

function escapeMarkdownInline(text: string) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/([*_`[\]])/g, '\\$1');
}

function normalizeWhitespace(text: string) {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeLine(text: string) {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getMetaContent(selector: string) {
  const node = document.querySelector(selector);
  const content = node?.getAttribute('content');
  return content ? content.trim() : '';
}

function normalizeRemoteUrl(url: string) {
  if (url.startsWith('//')) return `https:${url}`;
  return url;
}

function extractJsonObjectAfterMarker(source: string, marker: string) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return null;

  const start = source.indexOf('{', markerIndex + marker.length);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < source.length; i += 1) {
    const char = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }

  return null;
}

function parseEmbeddedJson(markers: string[]) {
  const scripts = Array.from(document.scripts);
  for (const script of scripts) {
    const text = script.textContent || '';
    if (!text) continue;

    for (const marker of markers) {
      const jsonText = extractJsonObjectAfterMarker(text, marker);
      if (!jsonText) continue;
      try {
        return JSON.parse(jsonText) as Record<string, any>;
      } catch {
        continue;
      }
    }
  }
  return null;
}

function decodeHtmlEntities(text: string) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

function normalizeTranscriptText(text: string) {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shouldInsertSpaceBetween(prev: string, next: string) {
  if (!prev || !next) return false;
  const prevChar = prev.slice(-1);
  const nextChar = next[0];
  if (/[\u4e00-\u9fff]/.test(prevChar) || /[\u4e00-\u9fff]/.test(nextChar)) return false;
  if (/[([{/"'“‘-]$/.test(prevChar)) return false;
  if (/^[,.;:!?)}\]"'”’]/.test(nextChar)) return false;
  return true;
}

function joinTranscriptTexts(parts: string[]) {
  let result = '';
  parts.forEach((part) => {
    const normalized = normalizeTranscriptText(part);
    if (!normalized) return;
    if (!result) {
      result = normalized;
      return;
    }
    result += shouldInsertSpaceBetween(result, normalized) ? ` ${normalized}` : normalized;
  });
  return result.trim();
}

function transcriptSegmentsToMarkdown(segments: TranscriptSegment[]) {
  const paragraphs: string[] = [];
  let current = '';
  let lastEndMs = 0;

  segments.forEach((segment) => {
    const text = normalizeTranscriptText(segment.text);
    if (!text) return;

    const gapMs = current ? Math.max(0, segment.startMs - lastEndMs) : 0;
    const shouldBreak =
      Boolean(current)
      && (gapMs >= 3500 || current.length >= 260);

    if (shouldBreak) {
      paragraphs.push(current.trim());
      current = text;
    } else {
      current = current ? joinTranscriptTexts([current, text]) : text;
    }

    lastEndMs = segment.startMs + (segment.durationMs || 0);
  });

  if (current.trim()) {
    paragraphs.push(current.trim());
  }

  return paragraphs.join('\n\n').trim();
}

function getPreferredLanguages() {
  const values = [
    ...(navigator.languages || []),
    navigator.language,
    'zh-CN',
    'zh',
    'en-US',
    'en',
  ]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);

  const unique = new Set<string>();
  values.forEach((value) => {
    unique.add(value);
    const base = value.split('-')[0];
    if (base) unique.add(base);
  });

  return Array.from(unique);
}

function scoreLanguage(language: string | undefined, label: string | undefined) {
  const haystack = `${language || ''} ${label || ''}`.toLowerCase();
  const preferred = getPreferredLanguages();

  for (let i = 0; i < preferred.length; i += 1) {
    const candidate = preferred[i].toLowerCase();
    if (!candidate) continue;
    if (haystack === candidate || haystack.includes(` ${candidate}`) || haystack.startsWith(candidate)) {
      return 100 - i;
    }
  }

  return 0;
}

function pickBestSubtitleCandidate(candidates: SubtitleCandidate[]) {
  if (candidates.length === 0) return null;

  const ranked = [...candidates].sort((a, b) => {
    const scoreA = scoreLanguage(a.language, a.label) + (a.isAuto ? 0 : 20);
    const scoreB = scoreLanguage(b.language, b.label) + (b.isAuto ? 0 : 20);
    return scoreB - scoreA;
  });

  return ranked[0] || null;
}

async function fetchJson(url: string) {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${url}`);
  }
  return response.json();
}

function getVideoIdFromUrl() {
  const url = new URL(window.location.href);
  return url.searchParams.get('v')?.trim() || '';
}

function getYouTubePlayerResponse() {
  return parseEmbeddedJson([
    'var ytInitialPlayerResponse = ',
    'ytInitialPlayerResponse = ',
  ]);
}

function getYouTubeInitialData() {
  return parseEmbeddedJson([
    'var ytInitialData = ',
    'ytInitialData = ',
  ]);
}

function getYouTubeConfigValue<T = any>(key: string): T | null {
  try {
    const ytcfg = (window as any).ytcfg;
    if (ytcfg && typeof ytcfg.get === 'function') {
      const value = ytcfg.get(key);
      return value ?? null;
    }
  } catch {
    // ignore
  }
  return null;
}

function getYouTubeCaptionTracks(playerResponse: Record<string, any> | null) {
  const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(tracks)) return [];

  return tracks
    .map((track) => {
      const baseUrl = typeof track?.baseUrl === 'string' ? track.baseUrl.trim() : '';
      if (!baseUrl) return null;

      const label =
        typeof track?.name?.simpleText === 'string'
          ? track.name.simpleText
          : Array.isArray(track?.name?.runs)
            ? track.name.runs.map((item: any) => item?.text || '').join('').trim()
            : '';

      return {
        url: normalizeRemoteUrl(baseUrl),
        language: typeof track?.languageCode === 'string' ? track.languageCode : '',
        label,
        isAuto: track?.kind === 'asr',
      } as SubtitleCandidate;
    })
    .filter((track): track is SubtitleCandidate => Boolean(track && track.url));
}

function parseYouTubeJson3Segments(payload: any) {
  const events = Array.isArray(payload?.events) ? payload.events : [];
  const segments: TranscriptSegment[] = [];

  events.forEach((event: any) => {
    const pieces = Array.isArray(event?.segs)
      ? event.segs.map((item: any) => decodeHtmlEntities(String(item?.utf8 || ''))).filter(Boolean)
      : [];
    const text = normalizeTranscriptText(joinTranscriptTexts(pieces));
    if (!text) return;

    segments.push({
      startMs: Number(event?.tStartMs || 0),
      durationMs: Number(event?.dDurationMs || 0),
      text,
    });
  });

  return segments;
}

function parseYouTubeXmlSegments(xmlText: string) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, 'text/xml');
  const nodes = Array.from(xml.querySelectorAll('text'));
  const segments: TranscriptSegment[] = [];

  nodes.forEach((node) => {
    const text = normalizeTranscriptText(decodeHtmlEntities(node.textContent || ''));
    if (!text) return;

    const start = Number.parseFloat(node.getAttribute('start') || '0');
    const duration = Number.parseFloat(node.getAttribute('dur') || '0');
    segments.push({
      startMs: Math.round(start * 1000),
      durationMs: Math.round(duration * 1000),
      text,
    });
  });

  return segments;
}

async function fetchYouTubeTranscriptSegments(candidate: SubtitleCandidate) {
  const captionUrl = new URL(candidate.url);
  captionUrl.searchParams.set('fmt', 'json3');

  try {
    const json = await fetchJson(captionUrl.toString());
    const jsonSegments = parseYouTubeJson3Segments(json);
    if (jsonSegments.length > 0) return jsonSegments;
  } catch {
    // fall through to XML
  }

  const xmlResponse = await fetch(candidate.url, { credentials: 'include' });
  if (!xmlResponse.ok) {
    throw new Error(`HTTP ${xmlResponse.status} while fetching YouTube transcript`);
  }

  const xmlText = await xmlResponse.text();
  return parseYouTubeXmlSegments(xmlText);
}

async function fetchYouTubePlayerResponse(videoId: string) {
  const innertubeApiKey = getYouTubeConfigValue<string>('INNERTUBE_API_KEY');
  const innertubeClientName = getYouTubeConfigValue<string>('INNERTUBE_CLIENT_NAME') || 'WEB';
  const innertubeClientVersion = getYouTubeConfigValue<string>('INNERTUBE_CLIENT_VERSION') || '2.20260606.02.00';
  const hl = document.documentElement.lang || 'en';
  const visitorData = getYouTubeConfigValue<string>('VISITOR_DATA') || undefined;

  if (!innertubeApiKey) {
    return null;
  }

  const response = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(innertubeApiKey)}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-YouTube-Client-Name': String(innertubeClientName),
      'X-YouTube-Client-Version': String(innertubeClientVersion),
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: innertubeClientName,
          clientVersion: innertubeClientVersion,
          hl,
          visitorData,
        },
      },
      videoId,
      playbackContext: {
        contentPlaybackContext: {
          html5Preference: 'HTML5_PREF_WANTS',
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching YouTube player response`);
  }

  return response.json();
}

async function extractYouTubeTranscriptContent(): Promise<ExtractSuccess | ExtractFailure | null> {
  const host = window.location.hostname.toLowerCase();
  if (!host.includes('youtube.com')) return null;
  if (window.location.pathname !== '/watch') return null;

  const videoId = getVideoIdFromUrl();
  if (!videoId) {
    return {
      success: false,
      error: '当前 YouTube 页面未找到视频 ID。',
    };
  }

  const initialPlayerResponse = getYouTubePlayerResponse();
  let playerResponse = initialPlayerResponse;
  let selectedTrack: SubtitleCandidate | null = pickBestSubtitleCandidate(getYouTubeCaptionTracks(playerResponse));

  if (!selectedTrack) {
    const fetchedPlayerResponse = await fetchYouTubePlayerResponse(videoId);
    if (fetchedPlayerResponse) {
      playerResponse = fetchedPlayerResponse;
      selectedTrack = pickBestSubtitleCandidate(getYouTubeCaptionTracks(playerResponse));
    }
  }

  const initialData = getYouTubeInitialData();
  const videoDetails = playerResponse?.videoDetails || initialData || {};
  const title = normalizeLine(
    String(
      videoDetails?.title
      || document.querySelector('ytd-watch-metadata h1')?.textContent
      || getMetaContent('meta[property="og:title"]')
      || document.title,
    )
      .replace(/\s*-\s*YouTube$/i, ''),
  );
  const channel = normalizeLine(
    String(
      videoDetails?.author
      || document.querySelector('ytd-watch-metadata #channel-name a')?.textContent
      || getMetaContent('meta[itemprop="author"]')
      || '',
    ),
  );
  const publishedAt = getMetaContent('meta[itemprop="datePublished"]');
  const coverImage =
    normalizeRemoteUrl(
      String(
        playerResponse?.videoDetails?.thumbnail?.thumbnails?.[playerResponse?.videoDetails?.thumbnail?.thumbnails?.length - 1]?.url
        || videoDetails?.thumbnail?.thumbnails?.[videoDetails?.thumbnail?.thumbnails?.length - 1]?.url
        || getMetaContent('meta[property="og:image"]')
        || '',
      ),
    ) || '';

  if (!selectedTrack) {
    return {
      success: false,
      error: '当前 YouTube 视频没有可用字幕轨，暂时无法剪藏字幕内容。',
    };
  }

  const segments = await fetchYouTubeTranscriptSegments(selectedTrack);
  if (segments.length === 0) {
    return {
      success: false,
      error: '当前 YouTube 视频存在字幕轨，但未能解析出字幕内容。',
    };
  }

  const transcriptMarkdown = transcriptSegmentsToMarkdown(segments);
  if (!transcriptMarkdown) {
    return {
      success: false,
      error: 'YouTube 字幕轨已获取，但未解析出有效字幕文本。',
    };
  }

  const lines: string[] = [];
  if (coverImage) {
    lines.push(`![](${coverImage})`);
    lines.push('');
  }
  lines.push(`- 原文: ${window.location.href}`);
  if (channel) lines.push(`- 频道: ${escapeMarkdownInline(channel)}`);
  if (publishedAt) lines.push(`- 发布时间: ${escapeMarkdownInline(publishedAt)}`);
  if (selectedTrack.language || selectedTrack.label) {
    const subtitleMeta = [selectedTrack.label, selectedTrack.language, selectedTrack.isAuto ? '自动字幕' : '人工字幕']
      .filter(Boolean)
      .join(' / ');
    lines.push(`- 字幕轨: ${escapeMarkdownInline(subtitleMeta)}`);
  }
  lines.push('- 来源: YouTube player captions');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 字幕');
  lines.push('');
  lines.push(transcriptMarkdown);

  return {
    success: true,
    title: title || videoId || document.title,
    markdown: normalizeWhitespace(lines.join('\n')),
    images: coverImage ? [coverImage] : [],
    url: window.location.href,
  };
}

function getBilibiliInitialState() {
  return parseEmbeddedJson([
    'window.__INITIAL_STATE__=',
    '__INITIAL_STATE__=',
  ]);
}

function getBilibiliPlayInfo() {
  return parseEmbeddedJson([
    'window.__playinfo__=',
    '__playinfo__=',
  ]);
}

function collectBilibiliSubtitleCandidates(value: any, seen = new Set<string>(), depth = 0): SubtitleCandidate[] {
  if (!value || depth > 8) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectBilibiliSubtitleCandidates(item, seen, depth + 1));
  }
  if (typeof value !== 'object') return [];

  const candidates: SubtitleCandidate[] = [];
  const maybeUrl = typeof value.subtitle_url === 'string' ? value.subtitle_url.trim() : '';
  if (maybeUrl) {
    const normalizedUrl = normalizeRemoteUrl(maybeUrl);
    if (!seen.has(normalizedUrl)) {
      seen.add(normalizedUrl);
      candidates.push({
        url: normalizedUrl,
        language: typeof value.lan === 'string' ? value.lan : '',
        label: typeof value.lan_doc === 'string' ? value.lan_doc : '',
        isAuto: Boolean(value.ai_type),
      });
    }
  }

  Object.values(value).forEach((child) => {
    candidates.push(...collectBilibiliSubtitleCandidates(child, seen, depth + 1));
  });

  return candidates;
}

function parseBilibiliSubtitleSegments(payload: any) {
  const body = Array.isArray(payload?.body) ? payload.body : [];
  return body
    .map((item: any) => ({
      startMs: Math.round(Number(item?.from || 0) * 1000),
      durationMs: Math.max(0, Math.round((Number(item?.to || 0) - Number(item?.from || 0)) * 1000)),
      text: normalizeTranscriptText(String(item?.content || '')),
    }))
    .filter((segment: TranscriptSegment) => Boolean(segment.text));
}

async function extractBilibiliTranscriptContent(): Promise<ExtractSuccess | ExtractFailure | null> {
  const host = window.location.hostname.toLowerCase();
  if (!host.includes('bilibili.com')) return null;
  if (!window.location.pathname.includes('/video/')) return null;

  const initialState = getBilibiliInitialState();
  const playInfo = getBilibiliPlayInfo();
  const candidates = [
    ...collectBilibiliSubtitleCandidates(initialState),
    ...collectBilibiliSubtitleCandidates(playInfo),
  ];

  if (candidates.length === 0) {
    return {
      success: false,
      error: '当前 Bilibili 视频没有可用字幕，暂时无法剪藏字幕内容。',
    };
  }

  const selectedTrack = pickBestSubtitleCandidate(candidates);
  if (!selectedTrack) {
    return {
      success: false,
      error: '未能选择合适的 Bilibili 字幕轨道。',
    };
  }

  const subtitleJson = await fetchJson(selectedTrack.url);
  const segments = parseBilibiliSubtitleSegments(subtitleJson);
  const transcriptMarkdown = transcriptSegmentsToMarkdown(segments);
  if (!transcriptMarkdown) {
    return {
      success: false,
      error: 'Bilibili 字幕轨存在，但未解析出有效字幕文本。',
    };
  }

  const title = normalizeLine(
    String(
      initialState?.videoData?.title
      || document.querySelector('h1')?.textContent
      || getMetaContent('meta[property="og:title"]')
      || document.title,
    )
      .replace(/_哔哩哔哩_bilibili$/i, ''),
  );
  const author = normalizeLine(String(initialState?.upData?.name || ''));
  const pubDate = initialState?.videoData?.pubdate
    ? new Date(Number(initialState.videoData.pubdate) * 1000).toISOString()
    : '';
  const coverImage = normalizeRemoteUrl(
    String(initialState?.videoData?.pic || getMetaContent('meta[property="og:image"]') || ''),
  );

  const lines: string[] = [];
  if (coverImage) {
    lines.push(`![](${coverImage})`);
    lines.push('');
  }
  lines.push(`- 原文: ${window.location.href}`);
  if (author) lines.push(`- UP 主: ${escapeMarkdownInline(author)}`);
  if (pubDate) lines.push(`- 发布时间: ${escapeMarkdownInline(pubDate)}`);
  if (selectedTrack.language || selectedTrack.label) {
    const subtitleMeta = [selectedTrack.label, selectedTrack.language, selectedTrack.isAuto ? '自动字幕' : '人工字幕']
      .filter(Boolean)
      .join(' / ');
    lines.push(`- 字幕轨: ${escapeMarkdownInline(subtitleMeta)}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 字幕');
  lines.push('');
  lines.push(transcriptMarkdown);

  return {
    success: true,
    title: title || document.title,
    markdown: normalizeWhitespace(lines.join('\n')),
    images: coverImage ? [coverImage] : [],
    url: window.location.href,
  };
}

function resolveXTitle() {
  const articleTitle = normalizeLine(
    document.querySelector('[data-testid="twitter-article-title"]')?.textContent || '',
  );
  if (articleTitle) return articleTitle;

  const h1Text = normalizeLine(document.querySelector('h1')?.textContent || '');
  if (h1Text) return h1Text;

  const ogTitle = getMetaContent('meta[property="og:title"]');
  if (ogTitle) {
    return ogTitle
      .replace(/\s+on X:?$/i, '')
      .replace(/^\(\d+\)\s*/, '')
      .replace(/\s+\/\s+X$/i, '')
      .trim();
  }

  return normalizeLine(
    document.title
      .replace(/\s+on X:?$/i, '')
      .replace(/^\(\d+\)\s*/, '')
      .replace(/\s+\/\s+X$/i, ''),
  );
}

function resolveXCoverImage() {
  return '';
}

function collectUniqueImageUrls(root: ParentNode) {
  const urls = new Set<string>();
  root.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src');
    if (!src) return;
    if (!/^https?:\/\//i.test(src) && !src.startsWith('//')) return;
    if (!/twimg\.com/i.test(src)) return;
    if (/profile_images|emoji|abs\.twimg\.com/i.test(src)) return;
    urls.add(src);
  });
  return Array.from(urls);
}

function findXCoverImage(articleContainer: ParentNode, articleBody: ParentNode) {
  const articleImages = collectUniqueImageUrls(articleContainer);
  const bodyImages = new Set(collectUniqueImageUrls(articleBody));
  const standalone = articleImages.find((src) => !bodyImages.has(src));
  if (standalone) return standalone;

  const firstArticleImage = articleImages[0];
  if (firstArticleImage) return firstArticleImage;

  const ogImage = getMetaContent('meta[property="og:image"]');
  if (ogImage && /twimg\.com/i.test(ogImage)) return ogImage;

  const twitterImage = getMetaContent('meta[name="twitter:image"]');
  if (twitterImage && /twimg\.com/i.test(twitterImage)) return twitterImage;

  return '';
}

function isLikelySectionHeading(text: string) {
  const normalized = normalizeLine(text);
  if (!normalized) return false;
  if (normalized.startsWith('@') || normalized.startsWith('>')) return false;
  if (/^[#*![-]/.test(normalized)) return false;
  if (normalized.length < 6 || normalized.length > 90) return false;
  if (/[.:;!?]$/.test(normalized)) return false;
  const words = normalized.split(/\s+/);
  if (words.length < 2 || words.length > 12) return false;
  return true;
}

function splitMarkdownBlocks(markdown: string) {
  return markdown
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function reflowXMarkdown(markdown: string) {
  const blocks = splitMarkdownBlocks(markdown);
  const result: string[] = [];

  for (let i = 0; i < blocks.length; i += 1) {
    let current = normalizeLine(blocks[i]);
    if (!current) continue;

    if (
      !current.startsWith('> ')
      && !current.startsWith('#')
      && !current.startsWith('![')
      && isLikelySectionHeading(current)
    ) {
      result.push(`## ${current}`);
      continue;
    }

    const isPlainTextBlock = (value: string) => (
      Boolean(value)
      && !value.startsWith('> ')
      && !value.startsWith('#')
      && !value.startsWith('![')
    );

    while (isPlainTextBlock(current) && i + 1 < blocks.length) {
      const next = normalizeLine(blocks[i + 1]);
      if (!isPlainTextBlock(next)) break;
      if (isLikelySectionHeading(next)) break;

      const currentWords = current.split(/\s+/).length;
      const nextWords = next.split(/\s+/).length;
      const shouldMerge =
        current.length < 40
        || next.length < 30
        || currentWords <= 4
        || nextWords <= 4;

      if (!shouldMerge) break;
      current = `${current} ${next}`.replace(/\s+/g, ' ').trim();
      i += 1;
    }

    result.push(current);
  }

  return result.join('\n\n').trim();
}

function isElementBold(element: HTMLElement) {
  const inlineWeight = element.style.fontWeight?.trim();
  if (inlineWeight === 'bold') return true;
  const computedWeight = window.getComputedStyle(element).fontWeight;
  const numericWeight = Number.parseInt(computedWeight, 10);
  return Number.isFinite(numericWeight) ? numericWeight >= 600 : computedWeight === 'bold';
}

function isElementItalic(element: HTMLElement) {
  if (element.style.fontStyle?.trim() === 'italic') return true;
  return window.getComputedStyle(element).fontStyle === 'italic';
}

function wrapInlineMarkdown(text: string, element: HTMLElement) {
  const trimmed = text.trim();
  if (!trimmed) return text;

  let result = trimmed;
  const tagName = element.tagName.toLowerCase();

  if (tagName === 'code') {
    result = `\`${result}\``;
  }

  if (tagName === 'strong' || tagName === 'b' || isElementBold(element)) {
    result = `**${result}**`;
  }

  if ((tagName === 'em' || tagName === 'i' || isElementItalic(element)) && !result.startsWith('**')) {
    result = `*${result}*`;
  }

  return text.replace(trimmed, result);
}

function renderXInlineMarkdown(root: Node): string {
  if (root.nodeType === Node.TEXT_NODE) {
    return escapeMarkdownInline(root.textContent || '');
  }

  if (!(root instanceof HTMLElement)) {
    return '';
  }

  const tagName = root.tagName.toLowerCase();
  if (tagName === 'br') return '\n';
  if (tagName === 'img') return '';

  const content = Array.from(root.childNodes)
    .map((child) => renderXInlineMarkdown(child))
    .join('');

  if (!content.trim()) return content;

  if (tagName === 'a') {
    const href = root.getAttribute('href')?.trim();
    if (href) {
      const absoluteHref = href.startsWith('http') ? href : new URL(href, window.location.origin).toString();
      return `[${content}](${absoluteHref})`;
    }
  }

  return wrapInlineMarkdown(content, root);
}

type XArticleBlock =
  | {
    kind: 'text';
    type: string;
    markdown: string;
  }
  | {
    kind: 'image';
    type: 'image';
    markdown: string;
    src: string;
  };

function isValidXInlineImage(src: string) {
  if (!src) return false;
  if (!/^https?:\/\//i.test(src) && !src.startsWith('//')) return false;
  if (!/twimg\.com/i.test(src)) return false;
  if (/profile_images|emoji|abs\.twimg\.com/i.test(src)) return false;
  return true;
}

function normalizeXImageUrl(src: string) {
  return src.startsWith('//') ? `https:${src}` : src;
}

function extractXOrderedBlocks(root: ParentNode, coverImage: string) {
  const blocks: XArticleBlock[] = [];
  const seenOffsets = new Set<string>();
  const seenImages = new Set<string>();
  const orderedNodes = root.querySelectorAll('[class*="longform-"][data-offset-key], img');

  orderedNodes.forEach((node) => {
    if (!(node instanceof HTMLElement)) return;

    if (node.tagName.toLowerCase() === 'img') {
      const rawSrc = node.getAttribute('src')?.trim() || '';
      const src = normalizeXImageUrl(rawSrc);
      if (!isValidXInlineImage(src)) return;
      if (src === coverImage || seenImages.has(src)) return;
      seenImages.add(src);
      blocks.push({
        kind: 'image',
        type: 'image',
        markdown: `![](${src})`,
        src,
      });
      return;
    }

    const offsetKey = node.getAttribute('data-offset-key')?.trim();
    if (!offsetKey || seenOffsets.has(offsetKey)) return;
    seenOffsets.add(offsetKey);

    const type = Array.from(node.classList).find((value) => value.startsWith('longform-')) || 'longform-unstyled';
    const markdown = normalizeWhitespace(renderXInlineMarkdown(node));
    if (!markdown) return;

    blocks.push({
      kind: 'text',
      type,
      markdown,
    });
  });

  return blocks;
}

function convertXBlocksToMarkdown(blocks: XArticleBlock[]) {
  if (blocks.length === 0) return '';

  const lines: string[] = [];

  blocks.forEach((block, index) => {
    if (block.kind === 'image') {
      if (lines.length > 0) lines.push('');
      lines.push(block.markdown);
      return;
    }

    const text = block.markdown.trim();
    if (!text) return;

    const isOrdered = block.type.includes('ordered-list-item');
    const isUnordered = block.type.includes('unordered-list-item');
    const isList = isOrdered || isUnordered;
    const prev = blocks[index - 1];
    const prevIsList = prev ? prev.type.includes('list-item') : false;

    if (lines.length > 0 && (!isList || !prevIsList)) {
      lines.push('');
    }

    if (block.type === 'longform-header-one') {
      lines.push(`## ${text}`);
      return;
    }

    if (block.type === 'longform-header-two') {
      lines.push(`### ${text}`);
      return;
    }

    if (block.type.includes('blockquote')) {
      const quote = text
        .split('\n')
        .map((line) => `> ${line.trim()}`)
        .join('\n');
      lines.push(quote);
      return;
    }

    if (isUnordered) {
      lines.push(`- ${text}`);
      return;
    }

    if (isOrdered) {
      lines.push('1. ' + text);
      return;
    }

    lines.push(text);
  });

  return normalizeWhitespace(lines.join('\n'));
}

function extractAuthorMeta(root: ParentNode) {
  const userNameRoot = root.querySelector('[data-testid="User-Name"]');
  if (!userNameRoot) return '';
  const anchor = userNameRoot.querySelector('a[href*="/"]');
  const handleMatch = anchor?.getAttribute('href')?.match(/\/([^/?#]+)$/);
  const handle = handleMatch?.[1] ? `@${handleMatch[1]}` : '';
  const text = normalizeWhitespace(userNameRoot.textContent || '');
  if (handle && text.includes(handle)) return text;
  return normalizeWhitespace([text, handle].filter(Boolean).join(' '));
}

function extractTimeMeta(root: ParentNode) {
  const time = root.querySelector('time');
  const iso = time?.getAttribute('datetime')?.trim();
  if (iso) return iso;
  return normalizeWhitespace(time?.textContent || '');
}

function cloneForMarkdown(root: HTMLElement) {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('script, style, noscript').forEach((node) => node.remove());
  clone.querySelectorAll('a').forEach((anchor) => {
    if (!anchor.getAttribute('href')) {
      anchor.replaceWith(document.createTextNode(anchor.textContent || ''));
    }
  });
  return clone;
}

function extractXArticleContent(): ExtractSuccess | null {
  const articleBody = document.querySelector('[data-testid="twitterArticleRichTextView"]') as HTMLElement | null;
  if (!articleBody) return null;

  const title = resolveXTitle();
  const articleContainer = articleBody.closest('article') ?? articleBody.parentElement ?? articleBody;
  const author = extractAuthorMeta(articleContainer);
  const publishedAt = extractTimeMeta(articleContainer);
  const coverImage = findXCoverImage(articleContainer, articleBody);

  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
  });

  const orderedBlocks = extractXOrderedBlocks(articleContainer, coverImage);
  const articleClone = cloneForMarkdown(articleBody);
  const fallbackMarkdown = reflowXMarkdown(turndownService.turndown(articleClone.innerHTML));
  const blockMarkdown = convertXBlocksToMarkdown(orderedBlocks);
  const bodyMarkdown = blockMarkdown || fallbackMarkdown;
  if (!bodyMarkdown) return null;

  const lines: string[] = [];
  if (coverImage) {
    lines.push(`![](${coverImage})`);
    lines.push('');
  }
  lines.push(`- 原文: ${window.location.href}`);
  if (author) lines.push(`- 作者: ${escapeMarkdownInline(author)}`);
  if (publishedAt) lines.push(`- 时间: ${escapeMarkdownInline(publishedAt)}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(bodyMarkdown);

  const images = collectUniqueImageUrls(articleContainer);
  if (coverImage && !images.includes(coverImage)) {
    images.unshift(coverImage);
  }

  return {
    success: true,
    title: title || document.title,
    markdown: normalizeWhitespace(lines.join('\n')),
    images,
    url: window.location.href,
  };
}

function isLikelyRawXHtmlPage() {
  const html = document.documentElement.innerHTML;
  return html.includes('window.__INITIAL_STATE__')
    || html.includes('id="react-root"')
    || html.includes('responsive-web/client-web/main.');
}

function extractGenericContent(): ExtractSuccess | ExtractFailure {
  const docClone = document.cloneNode(true) as Document;
  const reader = new Readability(docClone);
  const article = reader.parse();

  if (!article) {
    return { success: false, error: '无法解析此网页的正文内容' };
  }

  const articleContent = article.content ?? '';
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
  });
  const markdown = turndownService.turndown(articleContent);

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = articleContent;
  const imgElements = tempDiv.querySelectorAll('img');
  const imageUrls = Array.from(imgElements)
    .map((img) => img.getAttribute('src'))
    .filter((src): src is string => !!src);

  return {
    success: true,
    title: article.title || document.title,
    markdown,
    images: imageUrls,
    url: window.location.href,
  };
}

async function extractContent(): Promise<ExtractSuccess | ExtractFailure> {
  const host = window.location.hostname.toLowerCase();
  const isXHost = host === 'x.com' || host === 'www.x.com' || host === 'twitter.com' || host === 'www.twitter.com';
  const isYouTubeHost = host === 'www.youtube.com' || host === 'youtube.com';
  const isBilibiliHost = host === 'www.bilibili.com' || host === 'bilibili.com';

  if (isXHost) {
    const xArticle = extractXArticleContent();
    if (xArticle) return xArticle;

    if (isLikelyRawXHtmlPage()) {
      return {
        success: false,
        error: '当前 X 页面结构过于复杂，通用正文提取已被阻止。请进入文章正文页后再试。',
      };
    }
  }

  if (isYouTubeHost) {
    const youtubeTranscript = await extractYouTubeTranscriptContent();
    if (youtubeTranscript) return youtubeTranscript;
  }

  if (isBilibiliHost) {
    const bilibiliTranscript = await extractBilibiliTranscriptContent();
    if (bilibiliTranscript) return bilibiliTranscript;
  }

  return extractGenericContent();
}

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    // Listen for the extract message from background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'extract') {
        void (async () => {
          try {
            const result = await extractContent();
            sendResponse(result);
          } catch (err: any) {
            sendResponse({ success: false, error: err.message || '内容提取失败' });
          }
        })();
        return true; // Keep message channel open for async response
      }
    });
  },
});
