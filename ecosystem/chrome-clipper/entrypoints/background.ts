interface ProgressMessage {
  action: 'progress';
  step: 'extracting' | 'uploading' | 'creating';
  current?: number;
  total?: number;
}

function sendProgress(step: ProgressMessage['step'], current = 0, total = 0) {
  chrome.runtime.sendMessage({ action: 'progress', step, current, total }).catch(() => {
    // popup may be closed, ignore
  });
}

async function getSettings(): Promise<{ apiUrl: string; apiToken: string }> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['apiUrl', 'apiToken'], (data) => {
      resolve({
        apiUrl: (data.apiUrl || '').trim().replace(/\/+$/, ''),
        apiToken: (data.apiToken || '').trim(),
      });
    });
  });
}

async function downloadImage(url: string): Promise<Blob | null> {
  try {
    const resp = await fetch(url, { redirect: 'follow' });
    if (!resp.ok) return null;
    return await resp.blob();
  } catch (err) {
    console.warn('Failed to download image:', url, err);
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
  const { title: customTitle, category, status } = options;

  const { apiUrl, apiToken } = await getSettings();
  if (!apiUrl || !apiToken) {
    return { success: false, error: '请先在设置中配置 API URL 和 Token' };
  }

  // 1. Find active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    return { success: false, error: '没有找到活动标签页' };
  }

  sendProgress('extracting');

  // 2. Request content script to extract content
  let extractResult: any;
  try {
    extractResult = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id!, { action: 'extract' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  } catch (err: any) {
    return { success: false, error: `内容提取失败: ${err.message}. 请刷新页面重试。` };
  }

  if (!extractResult || !extractResult.success) {
    return { success: false, error: extractResult?.error || '无法提取页面内容' };
  }

  const { title: extractedTitle, markdown: rawMarkdown, images: rawImages, url: pageUrl } = extractResult;
  const finalTitle = customTitle || extractedTitle;
  let markdown = rawMarkdown;

  // 3. Process images: filter, deduplicate and resolve relative URLs
  const resolvedImages = (rawImages as string[])
    .map((img) => ({ original: img, resolved: resolveUrl(img, pageUrl) }))
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

    // Concurrency pool size: 3
    await runConcurrentTasks(uniqueImages, 3, async (img) => {
      try {
        const blob = await downloadImage(img.resolved);
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
        console.warn('Failed to process image:', img.resolved, err);
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
      const text = await resp.text();
      return { success: false, error: `创建文章失败: ${resp.status} ${text.slice(0, 200)}` };
    }

    const json = await resp.json();
    if (!json.success) {
      return { success: false, error: '创建文章失败: API 返回 success=false' };
    }

    return {
      success: true,
      slug: json.slug,
      title: finalTitle,
      imageCount: uploadedCount,
    };
  } catch (err: any) {
    return { success: false, error: `创建文章失败: ${err.message}` };
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
        .catch((err) => {
          sendResponse({ success: false, error: err.message });
        });
      return true; // Keep channel open for async response
    }
  });
});
