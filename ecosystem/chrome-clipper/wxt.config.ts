import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Wenxuan Blog Clipper',
    description: '一键剪藏网页到文轩博客草稿',
    version: '1.0.1',
    permissions: ['activeTab', 'storage', 'scripting'],
    host_permissions: ['<all_urls>'],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
