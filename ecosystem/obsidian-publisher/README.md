# obsidian-qiaomu-blog-publisher

一键将 Obsidian 笔记发布到你自己的 Qiaomu Blog 草稿箱。

## 功能

- 发布当前笔记为博客草稿
- 自动上传本地图片/音频/视频到博客 R2 存储
- 自动下载第三方图片并转存到 R2
- 支持标准 Markdown 图片语法和 Obsidian wikilink 语法
- 智能提取标题（YAML frontmatter > 一级标题 > 文件名）

## 安装

### 快速安装（推荐）

`release/` 目录下已包含预编译好的插件文件，直接复制即可：

1. 将 `release/main.js` 和 `release/manifest.json` 复制到：
   ```
   {你的笔记库}/.obsidian/plugins/qiaomu-blog-publisher/
   ```
2. 在 Obsidian 设置中启用插件

### 从源码构建（开发者）

```bash
cd ecosystem/obsidian-publisher
npm install
npm run build
```

构建后 `main.js` 会输出到当前目录，复制到插件目录即可。

## 配置

1. 打开 Obsidian 设置 > 第三方插件 > Qiaomu Blog Publisher
2. 填写 API 地址（默认 `https://your-domain.com`）
3. 填写 API Token（在你的博客后台获取）

## 使用

- **命令面板**：`Ctrl/Cmd + P` > 搜索 “发布到 Qiaomu Blog”
- **侧边栏图标**：点击上传图标

## 支持的媒体格式

- 图片：png, jpg, jpeg, gif, webp, svg, bmp, ico
- 音频：mp3, wav, ogg, m4a, flac, aac
- 视频：mp4, webm, mov, avi, mkv
