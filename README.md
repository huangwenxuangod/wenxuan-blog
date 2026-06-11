# AI Blog CMS for Cloudflare

English | [简体中文](README-ZH.md)

This repository is an AI-assisted blog CMS built on `Next.js 16 + OpenNext + Cloudflare Workers`. It combines a public blog, an authenticated editor, AI-assisted writing workflows, image generation, WeChat export/publish tooling, and an optional browser clipper ecosystem.

## Scope

The project is not a static Markdown renderer. It includes:

- Public blog pages with multiple homepage themes
- Admin panel and authenticated editor
- Rich text editing with TOC rail and right-side AI rail
- AI chat, rewrite, title generation, metadata generation, and image generation
- WeChat preview, export, and publishing bridge
- ZIP-based Skills system for editor AI
- Chrome clipper integration for capturing external content into drafts
- Cloudflare-native storage with `D1` and `R2`

## Current Architecture

- Runtime: `Cloudflare Workers`
- App framework: `Next.js 16` + `OpenNext`
- Database: `D1`
- Object storage: `R2`
- Editor: `Novel / Tiptap`
- UI primitives: `components/ui/primitives.ts`
- Complex interactions: `@headlessui/react`

Key implementation docs:

- [DEPLOY.md](DEPLOY.md)
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
- [docs/editor-ai-system-design.md](docs/editor-ai-system-design.md)
- [docs/skills-system.md](docs/skills-system.md)
- [docs/error-logging.md](docs/error-logging.md)
- [AGENTS.md](AGENTS.md)
- [CLAUDE.md](CLAUDE.md)

## Main Features

- WYSIWYG editor with autosave
- Left article rail and heading TOC rail
- Right-side AI rail for chat and editing actions
- AI post metadata generation: summary, tags, slug, cover
- AI image generation with insert/replace workflows
- WeChat preview and export: `Markdown`, `PDF`, `DOCX`
- Optional WeChat publish bridge
- Skills upload / enable / disable / attach in editor
- Long-image share card generation
- Multiple publish modes: public, draft, password, unlisted
- Full-text search
- Backup and admin settings panel

## Repository Layout

```text
app/          Next.js routes
components/   UI, editor, admin, and modal components
lib/          editor runtime, AI, storage, repositories, and helpers
db/           schema and migrations
docs/         focused implementation docs
ecosystem/    optional external publishing / clipping tools
tests/        Vitest coverage
```

## Local Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Common local routes:

- `/`
- `/admin`
- `/editor`

Worker-runtime local preview:

```bash
npm run preview
```

## Cloudflare Deployment

Minimal setup flow:

```bash
npx wrangler login
npm run cf:init -- --site-url=https://your-domain.com
npm run build
npm run deploy
```

Required secrets:

- `ADMIN_PASSWORD`
- `ADMIN_TOKEN_SALT`
- `AI_CONFIG_ENCRYPTION_SECRET`

Optional secrets / vars depending on features:

- `AI_API_KEY`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

See [DEPLOY.md](DEPLOY.md) for the full deployment checklist.

## Skills System

The editor can attach one uploaded Skill per AI request. Skills are stored as ZIP packages, indexed in `D1`, and their assets are stored in a private `R2` bucket bound as `SKILLS`.

See [docs/skills-system.md](docs/skills-system.md).

## Screenshots

- `docs/screenshots/home-themes.webp`
- `docs/screenshots/editor-overview.webp`
- `docs/screenshots/admin-settings.webp`
- `docs/screenshots/image-provider.png`

## Common Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Next.js local development |
| `npm run build` | Production build |
| `npm run test:run` | Run tests once |
| `npm run verify:quick` | Quick validation |
| `npm run verify` | Full validation |
| `npm run preview` | Preview in Worker runtime |
| `npm run deploy` | Deploy to Cloudflare |

## Notes

- The repository intentionally avoids committing secrets, live domains, and personal deployment details.
- If you publish this project, replace site metadata, manifest branding, and runtime vars with your own values.
