# Minimal Agent Skills System

本项目实现一个标准、极简、按需加载的 Agent Skills 系统。

## Package format

Skill 的标准实体是目录，上传和分发格式是 ZIP：

```text
article-rewriter.zip
└── article-rewriter/
    ├── SKILL.md
    ├── references/  # optional
    ├── assets/      # optional
    └── scripts/     # optional, stored but never executed
```

`SKILL.md` 必须包含 Agent Skills frontmatter：

```markdown
---
name: article-rewriter
description: Rewrite the current article selection while preserving facts.
version: 1.0.0
---

# Instructions

Prefer the current selection and preserve factual meaning.
```

`name` 必须使用小写字母、数字和连字符，且不超过 64 个字符。`description`
为必填项。`version` 可省略，默认 `1.0.0`。

## Storage and loading

- D1 的 `skills` 表保存发现元数据、版本、hash、R2 key、启用状态，以及安装时验证后的 `instructions_text`。
- 私有 R2 `SKILLS` bucket 的 `skills/` 前缀保存原始 ZIP、解压文件和独立的 `SKILL.md`。
- 编辑器只读取已启用 Skill 的名称和描述。
- 用户明确选择 Skill 后，服务端直接读取 D1 中已经验证好的 `instructions_text`。
- 每轮最多挂载一个 Skill，未选择时没有 Skill 文件读取。
- 公开 `IMAGES` bucket 只服务图片，不承载任何 Skill 资产。

## Security boundary

- ZIP 最大 5MB，最多 100 个文件。
- 解压后最大 10MB，单文件最大 2MB。
- 拒绝路径穿越、绝对路径、加密 ZIP、多 Skill 根目录和未知压缩算法。
- `scripts/` 仅作为标准包资源保存，当前版本不会执行。
- Skill 只能使用平台已经暴露给编辑器 AI 的工具，不能加载 npm、JS、Python 或 Shell。
- 平台安全规则与工具约束始终高于 Skill 指令。

## Administration

后台设置的 `Skills` 标签支持：

- 上传 ZIP 安装。
- 同名 Skill 更新。
- 启用和禁用。
- 删除 D1 记录与 R2 文件。

数据库迁移：

```bash
npx wrangler d1 execute DB --local --file=db/migrations/006_add_skills.sql
```

生产环境由维护者在部署前执行同一文件并添加 `--remote`。

Cloudflare 还需要额外补一个私有 R2 binding：

```toml
[[r2_buckets]]
binding = "SKILLS"
bucket_name = "your-project-skills"
```
