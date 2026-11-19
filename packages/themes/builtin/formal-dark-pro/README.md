# Formal Dark Pro — Pure Black Formal Theme for Typora 0.11.18 / 纯黑正式风格主题

A **pure-black dark formal theme** for Typora 0.11.18. Black background `#000000` with pure white text, elegant Optima + Songti SC font pairing, subtle blue-purple accents and calm green links for restrained visual hierarchy. Designed for résumés, formal documents, and business writing.

一个适配 Typora 0.11.18 的**纯黑深色正式风格**主题。纯黑底色 `#000000` 搭配纯白文字，采用 Optima + 宋体（Songti SC）优雅字体组合，浅蓝紫色强调与沉稳绿色链接形成克制的层次感。专为简历、正式文档、商务写作场景设计。

---

## Preview / 预览

- Background / 底色：pure black / 纯黑 `#000000`, ultra-clean / 极致干净
- Fonts / 字体：English / 英文 Optima (humanist sans-serif / 人文主义无衬线) + Chinese / 中文 宋体, elegant and formal / 优雅正式
- Accent / 强调色：soft blue-purple / 柔和浅蓝紫 `#A098D8`, subtle and non-distracting / 低调不刺眼
- Links / 链接色：calm green / 沉稳绿色 `#70B880`, harmonious on black / 黑底上清晰和谐
- Code blocks / 代码块：subtly lifted background / 微弱提亮底色 `#0E0E0E`, soft separation from body text / 与正文柔和区分
- Tables / 表格：minimal borders / 极浅边框 `#1E1E1E`, subtle header distinction / 表头微弱区分

---

## Installation / 安装步骤

### 1. Find the Typora theme folder / 找到 Typora 主题文件夹

Theme folder paths for Typora 0.11.18 / Typora 0.11.18 的主题文件夹路径：

| System / 系统 | Path / 路径 |
|------|------|
| **macOS** | Typora → **Preferences…** → **Appearance** → **Open Theme Folder** |
| **Windows** | Typora → **File** → **Preferences** → **Appearance** → **Open Theme Folder** |
| **Linux** | Typora → **Preferences** → **Appearance** → **Open Theme Folder** |

> Manual paths / 手动定位：
> - **macOS**: `~/.config/Typora/themes/`
> - **Windows**: `C:\Users\<user>\AppData\Roaming\Typora\themes\`
> - **Linux**: `~/.config/Typora/themes/`

### 2. Copy theme files / 放入主题文件

```
formal-dark-pro.css        ← main stylesheet / 主样式文件
formal-dark-pro.meta.json  ← theme metadata / 主题配置文件
```

### 3. Restart Typora / 重启 Typora

Quit completely / 完全退出（macOS: `Cmd+Q`, Windows: right-click tray icon → exit / 右键任务栏图标退出）, then reopen / 重新打开.

### 4. Activate theme / 切换主题

Typora → menu bar / 菜单栏 **Themes / 主题** → select **Formal Dark Pro** from the dropdown / 在下拉列表中选中 **Formal Dark Pro**.

---

## Files / 文件说明

| File / 文件 | Purpose / 作用 |
|------|------|
| `formal-dark-pro.css` | Core stylesheet — colors, fonts, layout definitions / 核心样式表，包含全部颜色、字体、排版定义 |
| `formal-dark-pro.meta.json` | Theme metadata for Typora / 主题元数据，供 Typora 识别和展示主题信息 |

---

## Customization / 自定义修改指南

Open `formal-dark-pro.css` and search for the following tags / 打开 CSS 文件，搜索以下标签快速定位：

| Tag / 搜索标签 | What you can modify / 可修改内容 |
|----------|------------|
| `[COLORS]` | All color variables / 所有颜色变量 |
| `[FONTS]` | Font stack / 字体栈 |
| `[LAYOUT]` | Width, padding, line-height, font-size / 写作区宽度、内边距、行高、字号 |
| `[CODE]` | Inline & fenced code block styles / 行内代码和围栏代码块样式 |
| `[TABLE]` | Table borders, header, stripes, padding / 表格边框、表头、斑马纹、内边距 |
| `[QUOTE]` | Blockquote border, background, radius / 引用块边框、背景、圆角 |
| `[HEADINGS]` | Heading sizes, colors, spacing / 各层级标题字号、颜色、间距 |
| `[LINK]` | Link colors and hover state / 链接颜色和悬浮态 |
| `[SIDEBAR]` | Sidebar/file-tree colors and states / 侧边栏背景、文字、悬浮和激活状态 |

### Quick tweaks / 常见微调

**1. Background / 调整底色** — search / 搜 `[COLORS]`:
```css
--bg-color: #000000;   /* try / 可改成 #0A0A0A or / 或 #111111 */
```

**2. Font / 更换字体** — search / 搜 `[FONTS]`:
```css
--body-font: "Optima", "Songti SC", "宋体", serif;
```
> Recommended formal fonts / 推荐正式字体：Palatino, Georgia, Garamond, 思源宋体 / Noto Serif CJK

**3. Font size / 调整字号** — search / 搜 `[LAYOUT]`:
```css
--base-font-size: 15px;
```

**4. Line height / 调整行高** — same area / 同一区域:
```css
--base-line-height: 1.8;
```

---

## Design Philosophy / 配色理念

Pure black `#000000` with pure white text. Content blocks are distinguished by 1%–8% brightness differences, keeping the overall look clean and unified. Accents use soft blue-purple (`#A098D8`) that doesn't compete for attention; links use a calm green (`#70B880`) that stays readable against the black background without being distracting.

纯黑底色 `#000000` 搭配纯白主文字，不同内容区块之间仅以 1%~8% 的微弱亮度差区分，保持整体干净统一。强调使用柔和的浅蓝紫色（`#A098D8`），不抢夺阅读注意力；链接使用沉稳绿色系（`#70B880`），在白字黑底环境中清晰可辨又不过分抢眼。

---

## Compatibility / 兼容性

- Minimum / 最低支持版本：Typora **0.11.18**
- Fully compatible with Typora 1.x / 完全兼容 Typora 1.x 各版本
- Cross-platform / 跨平台：macOS / Windows / Linux
- All CSS is CSS3 standard, no experimental features / 所有 CSS 特性均为 CSS3 标准

---

## License / 许可证

MIT License — free to use, modify, and distribute. / 自由使用、修改、分发。
