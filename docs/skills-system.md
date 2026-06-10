# Minimal Agent Skills System

This project includes a minimal, ZIP-based Agent Skills system for the editor AI.

## Package Format

The canonical unit is a directory; upload and distribution use ZIP:

```text
article-rewriter.zip
└── article-rewriter/
    ├── SKILL.md
    ├── references/  # optional
    ├── assets/      # optional
    └── scripts/     # optional, stored but not executed
```

`SKILL.md` must include frontmatter:

```markdown
---
name: article-rewriter
description: Rewrite the current article selection while preserving facts.
version: 1.0.0
---

# Instructions

Prefer the current selection and preserve factual meaning.
```

Constraints:

- `name`: lowercase letters, numbers, hyphens; max `64` chars
- `description`: required
- `version`: optional, defaults to `1.0.0`

## Runtime Model

- `D1` stores Skill metadata: `name`, `description`, `version`, `hash`, `R2 keys`, `enabled state`, and manifest JSON.
- Private `R2` bucket `SKILLS` stores the uploaded ZIP, extracted files, and standalone `SKILL.md`.
- The editor lists only enabled Skill summaries.
- When the user explicitly selects one Skill, the server reads `SKILL.md` from `R2`, parses its instructions, and appends them to the AI system prompt.
- Each AI request can mount at most one Skill.

## Storage Schema

Current table:

```sql
skills (
  id,
  name,
  description,
  version,
  source,
  archive_key,
  skill_md_key,
  content_hash,
  file_manifest_json,
  is_enabled,
  created_at,
  updated_at
)
```

The implementation does not currently duplicate `instructions_text` into `D1`; the validated markdown is read from `R2` on demand through `skill_md_key`.

## Security Boundary

- ZIP max size: `5MB`
- Max extracted size: `10MB`
- Max file count: `100`
- Max single file size: `2MB`
- Rejects path traversal, absolute paths, encrypted ZIPs, multiple roots, and unsupported compression methods
- `scripts/` are preserved as assets only; they are not executed
- Skills can only influence prompts; they cannot load external code, npm packages, shell commands, or arbitrary runtimes

## Admin Flow

The admin `Skills` settings tab supports:

- upload ZIP
- replace an existing Skill with the same `name`
- enable / disable
- delete both `D1` metadata and `R2` objects

## Editor Flow

The editor AI panel can:

- fetch enabled Skills
- allow manual selection of one Skill
- pass `skillId` to `/api/editor/ai-chat`
- append the selected Skill instructions to the system prompt for that request

## Cloudflare Requirements

Add a private `R2` binding:

```toml
[[r2_buckets]]
binding = "SKILLS"
bucket_name = "your-project-skills"
```

Do not reuse the public `IMAGES` bucket for Skills assets.

## Migration

Local:

```bash
npx wrangler d1 execute DB --local --file=db/migrations/006_add_skills.sql
```

Remote:

```bash
npx wrangler d1 execute DB --remote --file=db/migrations/006_add_skills.sql
```
