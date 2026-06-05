# Wenxuan Blog Open Source

English | [简体中文](README-ZH.md)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/huangwenxuangod/wenxuan-blog-opensource)
[![Use this template](https://img.shields.io/badge/GitHub-Use%20this%20template-111111?logo=github)](https://github.com/huangwenxuangod/wenxuan-blog-opensource/generate)

If you want to have a learning, writing, and sharing space that truly belongs to you, rather than fully entrusting your content to platform algorithms, this project is built for exactly that.

Wenxuan Blog is not just a static template that renders Markdown; it is a fully integrated blog engine. It features dual front-end and back-end editors, AI-powered writing assistance, AI image generation, a robust theme system, full-text search, API tokens, and an external publishing ecosystem—all pre-configured to make it easier for you to keep writing.

- Live Demo: To be added after deployment
- Introduction Article: To be added after deployment
- Current Repository: <https://github.com/huangwenxuangod/wenxuan-blog-opensource>

## Why Build Your Own Blog?

- Social media accounts can be banned, and platform traffic can fluctuate, but your own site is permanent.
- A writing system should be lightweight enough to open and write immediately, without being interrupted by complex backend processes.
- AI is best suited to handle repetitive tasks such as summaries, tags, covers, slugs, and image generation.
- A blog should not just be a display page; it should be your long-term knowledge asset.

## What You Will Get

- **What-You-See-Is-What-You-Get (WYSIWYG) Editing**: Edit on both front-end and back-end with an experience close to Lark or Notion.
- **Four Beautiful Homepage Themes**: Fully responsive, mobile-friendly, and ready to use out of the box.
- **New Editor Table of Contents (TOC) Rail**: Real-time parsing of document structures, automatic generation of hierarchical numbered directories, dual-direction scroll highlighting, smooth anchor transitions, and persistent state saving.
- **Redesigned Editor Share Dropdown & Long Image Share Cards (长图分享)**: Redesigned the top-right "Update/Publish" split button into a single elegant "Share" dropdown. Added a **Long Image Share** option with customizable themes (Classic Parchment, Minimalist White, Midnight Dark), typography choices (Serif or Sans-serif), and an integrated cross-origin safe QR code, downloading a 2x high-resolution card instantly.
- **Zero "Uncategorized" & Default "AI" Category**: Fully pruned the unclassified category from database seeds and UI dropdowns, enforcing "AI" as the system default.
- **Extreme Client-Side Code Splitting**: All sub-settings panels and heavy third-party libraries (`html2canvas`, `fflate`, `html2pdf.js`, `docx`) are lazily loaded using `next/dynamic` and runtime `await import(...)` to keep initial load bundles small and respect Cloudflare Workers' size constraints.
- **100% Data Ownership & Multi-Format One-Click Backup**: Export all articles (including full Markdown content), categories, and system settings as a **Markdown ZIP (with standard YAML Front Matter, perfectly compatible with Obsidian/Hugo)**, a **JSON Database Backup** for full restoration, or a **CSV Spreadsheet** (with UTF-8 BOM, ensuring Excel opens Chinese characters flawlessly without corruption).
- **Accessible Interaction via Headless UI**: All dropdown menus, modals, and overlays are refactored using Headless UI, providing smooth transitions, perfect keyboard navigation, and robust focus management.
- **Global Tactile Hover Feedback**: Framework-level hover pointer rules that automatically apply `cursor: pointer` to all buttons, selectors, option lists, and custom interactive elements, and fallback to `cursor: not-allowed` when disabled, providing a premium physical control feel.
- **Smart Brand Icons**: Automatically detects GitHub and Twitter/X links in the navigation bar (case-insensitive label or URL) and renders them as pixel-perfect, visually balanced inline SVG brand icons.
- **Claude Minimalist Aesthetic**: A deeply customized design with warm parchment tones (`#f5f4ed`), Anthropic Serif typeface, and soft circular shadows, creating a quiet, focused writing and reading environment.
- **Bubble Menu + Ask AI**: Select text to instantly rewrite, polish, expand, or translate.
- **AI-Powered Metadata Generation**: Automatically generates summaries, tags, SEO-friendly slugs, and covers.
- **AI Image Generation & Workflow**: Configurable text-to-image models, generation logs, and inline replacement/insertion workflows.
- **Image Context Menu**: Right-click to download, set as cover, align, crop, or use as reference for new image generation.
- **Granular Publishing Statuses**: Public, Draft, Password Protected, and Unlisted URL Access.
- **Default Out-of-the-Box Config**: Pre-configured navigation, themes, fonts, AI text/image model templates, and Ask AI preset actions.
- **Cloudflare Edge-Native Stack**: Run on Cloudflare Pages/Workers, using D1 (SQLite) and R2 (Object Storage) without maintaining servers or CDNs.

## Front-End Implementation Guidelines

To prevent semantic errors or style drift in the admin panel and editor, the project has strict conventions for components and interactions.

For full collaboration guidelines, see:

- `AGENTS.md`
- `CLAUDE.md`

### Component Layers

- `components/ui/primitives.ts`
  - `UiButton`
  - `UiIconButton`
  - `UiInput`
  - `UiTextarea`
  - `UiPanel`
  - `cx`
- `components/SelectDropdown.tsx`
  - Unified genuine dropdown selector
- `components/Dropdown.tsx`
  - Legacy compatibility wrapper, internally routing to `SelectDropdown`
- `components/Toast.tsx`
  - Global top-level toast notifications

### Interaction Semantics

- **Free Text Input**: Must use standard inputs (`UiInput`, `UiTextarea`).
- **Fixed Options Selection**: Must use genuine dropdowns (`SelectDropdown` or Listbox-based wrappers).
- **Searchable Selectors**: Still categorized as dropdowns; search inputs must live inside the expanded popover panel, not as a closed-state `ComboboxInput`.

This means:
- "Aspect Ratio", "Resolution", "Publish Status", "Category", and "Theme" must be dropdowns.
- Never fake a dropdown using a text-input look.

### Headless UI Primitives

Complex overlays must use `@headlessui/react`:
- `Dialog`: Modal overlays
- `Listbox`: Dropdown selectors
- `Menu`: Menus
- `Transition`: Transitions and animations

### Visual Aesthetic

Both admin panel and editor follow a unified minimalist language:
- Restrained
- Warm
- Low Noise
- Minimalist Cards
- Strong Consistency

We discourage:
- Cold gray SaaS-style default Tailwind colors.
- Fake dropdowns that look like inputs.
- Mixing multiple button, modal, or dropdown styles on the same page.
- Adding redundant helper texts to create visual hierarchy.

## Screenshots

### Four Homepage Themes

![Four Homepage Themes](docs/screenshots/home-themes.webp)

### Editor & WYSIWYG Writing

![Editor Overview](docs/screenshots/editor-overview.webp)

### Ask AI / Bubble Menu

![Ask AI](docs/screenshots/ask-ai.png)

### Admin Settings (Theme, Code, & API Tokens)

![Admin Settings](docs/screenshots/admin-settings.webp)

### Publishing Statuses

![Publish Status](docs/screenshots/publish-states.png)

### AI Models & Image Generation Config

![AI Models](docs/screenshots/image-provider.png)

## Open-Source Ecosystem

This repository includes external publishing tools so you can write wherever you find most comfortable, while syncing everything back to your central blog database.

- [`ecosystem/chrome-clipper`](ecosystem/chrome-clipper/README.md): Clip web content directly into your blog drafts.
- [`ecosystem/obsidian-publisher`](ecosystem/obsidian-publisher/README.md): Publish notes from Obsidian with a single click.
- [`ecosystem/qiaomu-blog-publish-skill`](ecosystem/qiaomu-blog-publish-skill/README.md): Publish directly via Claude Skills or command-line workflows.
- [`ecosystem/README.md`](ecosystem/README.md): Ecosystem tools overview.

## One-Click Deployment to Cloudflare

Simply click the `Deploy to Cloudflare` button above.

This template is fully optimized for the Cloudflare Deploy Button:
- Cloudflare reads the Worker configuration in the repository.
- Automatically provisions and binds `D1` and `R2` resources.
- Runs the custom deploy script to initialize the database schema and default configurations.

We recommend preparing these environment variables during deployment:
- `NEXT_PUBLIC_SITE_URL`
- `ADMIN_PASSWORD`
- `ADMIN_TOKEN_SALT`
- `AI_CONFIG_ENCRYPTION_SECRET`
- `AI_API_KEY` (Optional)

If you prefer provisioning Cloudflare resources manually via CLI:

```bash
npm install
cp .env.example .env.local
npx wrangler login
npm run cf:init -- --site-url=https://your-domain.com
npm run build
npm run deploy
```

## Local Development

```bash
git clone https://github.com/huangwenxuangod/wenxuan-blog-opensource.git
cd wenxuan-blog-opensource
npm install
cp .env.example .env.local
npm run dev
```

Key Routes:
- Homepage: `/`
- Admin Panel: `/admin`
- Editor: `/editor`

To preview locally inside the Cloudflare Worker runtime:

```bash
npm run preview
```

## Default Initialized Content

Upon initial setup, the template automatically provisions:
- Default navigation links.
- Default themes and fonts.
- Default categories.
- AI text model templates.
- AI image model templates.
- Article summary, tags, slug, and cover generators.
- Ask AI preset actions.

All API keys are kept safe and are never committed to the repository; they are configured via Cloudflare Secrets or the Admin settings panel.

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS v4 (Next-generation high-speed style engine)
- Headless UI (@headlessui/react accessible components)
- OpenNext for Cloudflare
- Cloudflare Workers
- Cloudflare D1
- Cloudflare R2
- Novel / Tiptap

## Common Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Local development via Next.js |
| `npm run build` | Build the production application |
| `npm run verify:quick` | Quick check (lint, test, and build) |
| `npm run verify` | Run full validation pipeline |
| `npm run cf:init` | Initialize Cloudflare resources and template defaults |
| `npm run preview` | Local preview inside Worker runtime |
| `npm run deploy` | Deploy to Cloudflare Workers |

## Author

- Wenxuan
- GitHub: <https://github.com/huangwenxuangod>
- X / Twitter: <https://x.com/hungxun254458>
- Blog: To be added after deployment
