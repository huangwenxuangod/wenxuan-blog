# CLAUDE.md - Claude 执行摘要

本文件是给 Claude 类智能体的快速执行摘要。完整规范以 [AGENTS.md](AGENTS.md) 为准。

---

## 1. 必须先遵守的事

1. 涉及 UI、交互、编辑器、后台样式时，先读 `AGENTS.md`
2. 绝对禁止使用原生 `<select>` 控件或手搓下拉框，只要是从固定选项中选择，必须复用 `Dropdown` 或 `SelectDropdown` 组件。
3. 不要手写复杂交互 DOM，优先使用 `@headlessui/react`
3. 不要绕开现有组件库，优先使用：
   - `UiButton`
   - `UiIconButton`
   - `UiInput`
   - `UiTextarea`
   - `UiPanel`
   - `SelectDropdown`
   - `Dropdown`
   - `Toast`

---

## 2. 组件语义强制规则

### 输入框

只有当用户可以输入自由文本时，才能使用输入框外观。

### 下拉框

只要是从固定选项中选择，就必须使用真正的下拉框。

必须满足：

- 关闭态不可看起来像可编辑输入框
- 关闭态必须是触发器语义
- 展开后再显示选项列表

### 可搜索选择器

本质仍然是下拉框。

规则：

- 关闭态看起来仍然是下拉框
- 搜索输入只能出现在展开后的面板里
- 不能把关闭态直接做成 `ComboboxInput` 外观

---

## 3. 视觉语言强制规则

本项目的风格是：

- 极简
- 克制
- 温暖
- 低噪音
- 强一致性

禁止：

- 冷灰默认 Tailwind 风
- 过度卡片化
- 无意义提示文案
- 同页多套按钮或弹窗风格
- 下拉框做成输入框

---

## 4. 推荐工作流

1. 先判断控件语义
2. 查现有 primitives 是否已覆盖
3. 若缺失，先补组件层
4. 再接业务页面
5. 跑 `npm run lint`
6. 跑 `npm run build`

---

## 5. 常用命令

- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run test:run`
- `npm run verify:quick`
- `npm run verify`
- `npm run preview`
- `npm run deploy`

---

## 6. 一句话标准

如果一个控件的外观和它真实语义不一致，这个实现就是错的。
