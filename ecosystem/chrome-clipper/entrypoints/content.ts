import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    // Listen for the extract message from background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'extract') {
        try {
          // Clone document to avoid mutating the active page
          const docClone = document.cloneNode(true) as Document;
          const reader = new Readability(docClone);
          const article = reader.parse();

          if (!article) {
            sendResponse({ success: false, error: '无法解析此网页的正文内容' });
            return;
          }

          // Initialize Turndown
          const turndownService = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced',
          });

          // Convert HTML to Markdown
          const markdown = turndownService.turndown(article.content);

          // Extract all image URLs from the parsed HTML content
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = article.content;
          const imgElements = tempDiv.querySelectorAll('img');
          
          const imageUrls = Array.from(imgElements)
            .map((img) => img.getAttribute('src'))
            .filter((src): src is string => !!src);

          sendResponse({
            success: true,
            title: article.title || document.title,
            markdown,
            images: imageUrls,
            url: window.location.href,
          });
        } catch (err: any) {
          sendResponse({ success: false, error: err.message || '内容提取失败' });
        }
        return true; // Keep message channel open for async response
      }
    });
  },
});
