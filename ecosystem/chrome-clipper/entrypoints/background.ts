import { loadSettings } from '../utils/settings';
import {
  createOperationId,
  reportDiagnosticError,
  writeLog,
  type DiagnosticError,
} from '../utils/logger';

interface ProgressMessage {
  action: 'progress';
  step: 'extracting' | 'uploading' | 'creating';
  current?: number;
  total?: number;
}

interface ExtractResult {
  success: boolean;
  title?: string;
  markdown?: string;
  images?: string[];
  url?: string;
  error?: string;
}

interface ApiFailureDetails {
  message: string;
  details?: string;
  hint?: string;
  requestId?: string;
}

function isInjectablePage(url?: string): boolean {
  return Boolean(url && /^(https?|file):/i.test(url));
}

function sendExtractMessage(tabId: number): Promise<ExtractResult> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { action: 'extract' }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response as ExtractResult);
    });
  });
}

async function extractPage(
  tab: chrome.tabs.Tab,
  operationId: string,
): Promise<ExtractResult | DiagnosticError> {
  if (!tab.id || !isInjectablePage(tab.url)) {
    return reportDiagnosticError({
      code: 'UNSUPPORTED_PAGE',
      phase: 'extracting',
      message: '当前页面不允许扩展读取内容',
      operationId,
      details: tab.url || 'unknown',
      hint: '请在普通 http/https 网页中使用；Chrome 设置页、扩展页和应用商店页面无法剪藏。',
    });
  }

  try {
    return await sendExtractMessage(tab.id);
  } catch (firstError) {
    await writeLog('warn', 'CONTENT_SCRIPT_MISSING', {
      operationId,
      context: { tabId: tab.id, url: tab.url },
      error: firstError,
    });

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content-scripts/content.js'],
      });
      await writeLog('info', 'CONTENT_SCRIPT_INJECTED', {
        operationId,
        context: { tabId: tab.id, url: tab.url },
      });
      return await sendExtractMessage(tab.id);
    } catch (retryError) {
      return reportDiagnosticError({
        code: 'CONTENT_SCRIPT_UNAVAILABLE',
        phase: 'extracting',
        message: '无法连接网页内容提取脚本',
        operationId,
        details: retryError instanceof Error ? retryError.message : String(retryError),
        hint: tab.url?.startsWith('file:')
          ? '请在扩展管理页启用“允许访问文件网址”，然后重试。'
          : '请刷新当前网页后重试；如果仍失败，请复制诊断日志。',
        context: { tabId: tab.id, url: tab.url },
        error: retryError,
      });
    }
  }
}

async function readApiFailure(response: Response): Promise<ApiFailureDetails> {
  const requestId = response.headers.get('x-request-id') || undefined;
  const headerHint = response.headers.get('x-error-hint') || undefined;
  const text = await response.text();
  try {
    const data = JSON.parse(text) as {
      error?: string | {
        message?: string;
        details?: string;
        hint?: string;
        requestId?: string;
      };
    };
    if (data.error && typeof data.error === 'object') {
      return {
        message: data.error.message || `HTTP ${response.status}`,
        details: data.error.details,
        hint: data.error.hint,
        requestId: data.error.requestId || requestId,
      };
    }
    return {
      message: typeof data.error === 'string' ? data.error : `HTTP ${response.status}`,
      details: text.slice(0, 500),
      hint: headerHint,
      requestId,
    };
  } catch {
    return {
      message: `HTTP ${response.status} ${response.statusText}`,
      details: text.slice(0, 500),
      hint: headerHint,
      requestId,
    };
  }
}

function sendProgress(step: ProgressMessage['step'], current = 0, total = 0) {
  chrome.runtime.sendMessage({ action: 'progress', step, current, total }).catch(() => {
    // popup may be closed, ignore
  });
}

async function downloadImage(url: string, operationId: string): Promise<Blob | null> {
  try {
    const resp = await fetch(url, { redirect: 'follow' });
    if (!resp.ok) {
      await writeLog('warn', 'IMAGE_DOWNLOAD_HTTP_ERROR', {
        operationId,
        context: { url, status: resp.status },
      });
      return null;
    }
    return await resp.blob();
  } catch (err) {
    await writeLog('warn', 'IMAGE_DOWNLOAD_FAILED', {
      operationId,
      context: { url },
      error: err,
    });
    return null;
  }
}

async function uploadImage(blob: Blob, filename: string, apiUrl: string, apiToken: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', blob, filename);

  const resp = await fetch(`${apiUrl}/api/uploads`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
    body: formData,
  });

  if (!resp.ok) {
    throw new Error(`Upload failed: ${resp.status} ${resp.statusText}`);
  }

  const json = await resp.json();
  if (!json.success || !json.url) {
    throw new Error('Upload response: success=false');
  }

  return json.url;
}

function filenameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const pathname = u.pathname;
    const parts = pathname.split('/');
    let name = parts[parts.length - 1] || 'image';
    name = name.split('?')[0].split('#')[0];
    if (!/\.\w{2,5}$/.test(name)) {
      name += '.png';
    }
    if (name.length > 80) {
      name = name.slice(-80);
    }
    return name;
  } catch {
    return 'image.png';
  }
}

function resolveUrl(imgUrl: string, pageUrl: string): string | null {
  if (/^https?:\/\//i.test(imgUrl)) return imgUrl;
  if (imgUrl.startsWith('//')) return 'https:' + imgUrl;
  if (imgUrl.startsWith('data:')) return null; // Skip base64
  try {
    return new URL(imgUrl, pageUrl).href;
  } catch {
    return null;
  }
}

function replaceImageUrlsInMarkdown(markdown: string, replacements: Map<string, string>): string {
  // 1. Replace Markdown image syntax: ![alt](url)
  let result = markdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
    const cleanUrl = url.trim();
    const replaced = replacements.get(cleanUrl);
    return replaced ? `![${alt}](${replaced})` : match;
  });

  // 2. Replace HTML img tag syntax: <img src="url" ... />
  result = result.replace(/<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi, (match, url) => {
    const cleanUrl = url.trim();
    const replaced = replacements.get(cleanUrl);
    if (replaced) {
      return match.replace(url, replaced);
    }
    return match;
  });

  return result;
}

// Custom concurrent task runner with pool limit
async function runConcurrentTasks<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      const item = items[currentIndex];
      try {
        results[currentIndex] = await fn(item, currentIndex);
      } catch (err) {
        console.error(`Task at index ${currentIndex} failed:`, err);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

async function clipPage(options: { title?: string; category?: string; status?: string }) {
  const operationId = createOperationId();
  const { title: customTitle, category, status } = options;
  await writeLog('info', 'CLIP_STARTED', {
    operationId,
    context: { category, status },
  });

  const settings = await loadSettings();
  const apiUrl = settings.apiUrl.trim().replace(/\/+$/, '');
  const apiToken = settings.apiToken.trim();
  if (!apiUrl || !apiToken) {
    const diagnostic = await reportDiagnosticError({
      code: 'SETTINGS_MISSING',
      phase: 'settings',
      message: '请先在设置中配置 API URL 和 Token',
      operationId,
    });
    return { success: false, error: diagnostic.message, diagnostic };
  }

  // 1. Find active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    const diagnostic = await reportDiagnosticError({
      code: 'ACTIVE_TAB_MISSING',
      phase: 'extracting',
      message: '没有找到活动标签页',
      operationId,
    });
    return { success: false, error: diagnostic.message, diagnostic };
  }

  sendProgress('extracting');

  // 2. Request content script to extract content
  const extractResult = await extractPage(tab, operationId);
  if ('errorId' in extractResult) {
    return {
      success: false,
      error: extractResult.message,
      diagnostic: extractResult,
    };
  }

  if (!extractResult || !extractResult.success) {
    const diagnostic = await reportDiagnosticError({
      code: 'CONTENT_EXTRACTION_FAILED',
      phase: 'extracting',
      message: extractResult?.error || '无法提取页面内容',
      operationId,
      context: { url: tab.url },
    });
    return { success: false, error: diagnostic.message, diagnostic };
  }

  const { title: extractedTitle, markdown: rawMarkdown, images: rawImages, url: pageUrl } = extractResult;
  const finalTitle = customTitle || extractedTitle;
  let markdown = rawMarkdown || '';
  const pageImages = rawImages || [];
  const sourceUrl = pageUrl || tab.url || '';
  await writeLog('info', 'CONTENT_EXTRACTED', {
    operationId,
    context: {
      url: sourceUrl,
      titleLength: finalTitle?.length || 0,
      markdownLength: markdown.length,
      imageCount: pageImages.length,
    },
  });

  // 3. Process images: filter, deduplicate and resolve relative URLs
  const resolvedImages = pageImages
    .map((img) => ({ original: img, resolved: resolveUrl(img, sourceUrl) }))
    .filter((img): img is { original: string; resolved: string } => !!img.resolved);

  // Deduplicate based on resolved URL
  const uniqueImagesMap = new Map<string, string>();
  resolvedImages.forEach((img) => {
    uniqueImagesMap.set(img.resolved, img.original);
  });

  const uniqueImages = Array.from(uniqueImagesMap.entries()).map(([resolved, original]) => ({
    resolved,
    original,
  }));

  const replacements = new Map<string, string>();
  let uploadedCount = 0;

  if (uniqueImages.length > 0) {
    sendProgress('uploading', 0, uniqueImages.length);

    // Concurrency pool size: 10
    await runConcurrentTasks(uniqueImages, 10, async (img) => {
      try {
        const blob = await downloadImage(img.resolved, operationId);
        if (!blob || blob.size === 0) return;

        const filename = filenameFromUrl(img.resolved);
        const uploadedPath = await uploadImage(blob, filename, apiUrl, apiToken);

        const fullUrl = uploadedPath.startsWith('http')
          ? uploadedPath
          : `${apiUrl}${uploadedPath}`;

        replacements.set(img.original, fullUrl);
        uploadedCount++;
        sendProgress('uploading', uploadedCount, uniqueImages.length);
      } catch (err) {
        await writeLog('warn', 'IMAGE_PROCESSING_FAILED', {
          operationId,
          context: { url: img.resolved },
          error: err,
        });
      }
    });

    // Apply robust URL replacements in markdown
    markdown = replaceImageUrlsInMarkdown(markdown, replacements);
  }

  // 4. Create post on the blog
  sendProgress('creating');

  try {
    const postBody: Record<string, any> = {
      title: finalTitle,
      content: markdown,
      status: status || 'draft',
    };

    if (category) {
      postBody.category = category;
    }

    const resp = await fetch(`${apiUrl}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify(postBody),
    });

    if (!resp.ok) {
      const apiFailure = await readApiFailure(resp);
      const diagnostic = await reportDiagnosticError({
        code: 'POST_CREATE_HTTP_ERROR',
        phase: 'creating',
        message: `创建文章失败: ${apiFailure.message}`,
        operationId,
        details: apiFailure.details,
        hint: apiFailure.hint,
        requestId: apiFailure.requestId,
        context: { status: resp.status, apiUrl },
      });
      return { success: false, error: diagnostic.message, diagnostic };
    }

    const json = await resp.json();
    if (!json.success) {
      const diagnostic = await reportDiagnosticError({
        code: 'POST_CREATE_INVALID_RESPONSE',
        phase: 'creating',
        message: '创建文章失败: API 返回 success=false',
        operationId,
        context: { apiUrl },
      });
      return { success: false, error: diagnostic.message, diagnostic };
    }

    await writeLog('info', 'CLIP_SUCCEEDED', {
      operationId,
      context: {
        slug: json.slug,
        status: status || 'draft',
        imageCount: uploadedCount,
      },
    });
    return {
      success: true,
      slug: json.slug,
      title: finalTitle,
      imageCount: uploadedCount,
      status: status || 'draft',
      operationId,
    };
  } catch (err) {
    const diagnostic = await reportDiagnosticError({
      code: 'POST_CREATE_NETWORK_ERROR',
      phase: 'creating',
      message: '创建文章请求失败',
      operationId,
      details: err instanceof Error ? err.message : String(err),
      hint: '请检查博客地址、网络连接和 Cloudflare 服务状态。',
      context: { apiUrl },
      error: err,
    });
    return { success: false, error: diagnostic.message, diagnostic };
  }
}

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'clip') {
      clipPage({
        title: message.title,
        category: message.category,
        status: message.status,
      })
        .then(sendResponse)
        .catch(async (err) => {
          const diagnostic = await reportDiagnosticError({
            code: 'CLIP_UNHANDLED_ERROR',
            phase: 'unknown',
            message: '剪藏过程中发生未处理错误',
            details: err instanceof Error ? err.message : String(err),
            error: err,
          });
          sendResponse({ success: false, error: diagnostic.message, diagnostic });
        });
      return true; // Keep channel open for async response
    }
  });
});
