# CLAUDE.md - Claude 专属开发规约

> **重要提示**：本项目的核心智能体开发指南、架构演进与美学规范已统一收录在 **[AGENTS.md](AGENTS.md)** 中。请在开始开发前优先阅读并严格遵守 **AGENTS.md** 中的规约。

---

## 1. 常用开发指令

- **启动开发环境**: `npm run dev`
- **构建生产版本**: `npm run build`
- **运行测试套件**: `npm run test` (交互式) / `npm run test:run` (单次运行)
- **代码静态检查**: `npm run lint`
- **快速验证链路**: `npm run verify:quick`
- **完整验证链路**: `npm run verify`
- **Cloudflare 资源初始化**: `npm run cf:init -- --site-url=https://your-domain.com`
- **重新生成 Cloudflare 绑定类型**: `npm run cf-typegen`
- **本地运行时预览**: `npm run preview`
- **编译并部署 Workers**: `npm run deploy`

---

## 2. 编码与设计核心准则

1. **美学规范**：严格遵循 Claude 极简美学（详见 `DESIGN.md` 与 `AGENTS.md`）。使用温暖的羊皮纸背景色（`#f5f4ed`），严禁使用冷色调蓝灰（如 Tailwind 的 `gray-`、`slate-`、`zinc-` 等）。
2. **交互规范**：下拉菜单、浮层、模态弹窗等交互组件**必须**使用 `@headlessui/react`，严禁手写不带无障碍、焦点捕获和键盘导航的自定义 DOM 交互。**所有交互元素（如 `button`、`select`、下拉框选项、模拟按钮等）在 Hover 时必须将 `cursor` 改为 `pointer`**（已在 `app/globals.css` 中全局配置，开发时应确保其符合语义，禁用状态自动切换为 `not-allowed`）。
3. **样式提炼**：优先复用 `app/globals.css` 中的标准化样式类（如 `.editor-ghost-input`、`.editor-quiet-icon-button`、`.ui-control`、`.ui-popover` 等），拼接类名时使用 `components/ui/primitives.ts` 导出的 `cx` 工具函数。
4. **类型安全**：严格使用 TypeScript。修改 Cloudflare 绑定后务必运行 `npm run cf-typegen` 更新 `worker-configuration.d.ts`。
5. **测试保障**：任何核心库或 API 端点的修改，都必须运行 `npm run test:run` 确保全套测试用例 100% 通过。
