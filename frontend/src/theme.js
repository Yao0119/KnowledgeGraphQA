/**
 * 设计系统 —— 单一事实来源（iOS 圆角毛玻璃 / 白灰黑单色）
 *
 * 方向由用户指定：
 *   - iOS 风格：大圆角 + 毛玻璃（backdrop-blur）+ 柔和投影
 *   - 主题只用白、灰、黑三色
 *   - **除图谱节点颜色外，界面不出现杂色**（状态点用 iOS 红/绿，因为它们承载语义）
 *   - 侧边栏悬浮、取消顶部栏、用户/设置移左下角、通知单按钮放右上
 *
 * 用法：组件里 import { color, font, space, radius, motion } from "../theme"，
 * 不要在组件里散落 hex。CSS 侧在 index.css 的 :root 里镜像同一份值。
 */

export const color = {
  // ---- 底层 ----
  // iOS systemGroupedBackground 原本是 #F2F2F7（带一点蓝偏）。
  // 用户要求"白灰黑"，所以中性化成纯灰，避免出现可察觉的蓝调。
  bg: "#F2F2F2",
  surface: "#FFFFFF",
  surface2: "#F2F2F2",
  surface3: "#E5E5EA", // iOS fill：输入框、未选中的胶囊

  border: "rgba(0, 0, 0, 0.06)",
  borderStrong: "rgba(0, 0, 0, 0.12)",

  // ---- 文字（iOS label 三级）----
  fg: "#1C1C1E", // label
  fgMuted: "#48484A", // secondaryLabel（白底 8.9:1）
  // 作正文用，必须过 4.5:1；#6E6E73 白底 5.0:1 ✓
  // （更浅的 #8A8A8E 只有 3.4:1，只允许用于非文字元素）
  fgFaint: "#6E6E73",
  lineFaint: "#C7C7CC", // 分隔线、图标，不承担对比度义务

  // ---- 主色：黑 ----
  // 白灰黑主题下，主操作用近黑而不是蓝。iOS 17 的单色按钮就是这个观感。
  primary: "#1C1C1E",
  primaryHover: "#2C2C2E",
  primarySoft: "#E5E5EA", // 选中态底色：浅灰填充 + 黑字

  // ---- 跨层映射标记 ----
  // 用户要求"除图谱节点外不要杂色"，所以界面上的映射标记也走单色
  // （深底 + 白字）。图谱里核心节点的描边仍用琥珀，因为那属于"节点颜色"。
  accent: "#1C1C1E",
  accentSoft: "#E5E5EA",
  accentText: "#FFFFFF",

  // ---- 语义色（只用于状态点与错误提示，用量极小）----
  // iOS red 用深一档，保证作文字时也过 4.5:1
  danger: "#D70015",
  dangerDot: "#FF3B30",
  dangerSoft: "#FDE8E8",
  success: "#15803D",
  successDot: "#34C759",
  successSoft: "#E7F6EC",
  warning: "#8A6100",

  // ---- 毛玻璃 ----
  glass: "rgba(255, 255, 255, 0.72)",
  glassStrong: "rgba(255, 255, 255, 0.86)",
  glassBorder: "rgba(255, 255, 255, 0.65)",

  // 图谱容器底（保持近白中性，不带蓝偏，让节点颜色成为唯一彩源）
  graphBg: "#FBFBFB",
};

// ========================================
// 字体
// ========================================
// UI 字体：拉丁用 Fira Sans，中文回落到系统字体。
// 刻意**不引 Google Fonts CDN**：这是可能离线运行的内网工具，
// 依赖外网字体会让首屏在断网时退化甚至闪烁。装了 Fira 的机器自动生效，没装就用系统字体。
export const font = {
  ui: '"Fira Sans", -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", system-ui, sans-serif',
  // 等宽只给"机器标识符"：病毒名、关系名、id
  mono: '"Fira Code", ui-monospace, SFMono-Regular, "Cascadia Code", Consolas, "Liberation Mono", monospace',
  // 类型刻度（iOS 偏小字号 + 明确层级）
  size: {
    micro: 11, // 徽标、图例
    small: 12, // 次要说明、表头
    base: 13, // 正文
    md: 14, // 强调正文
    lg: 17, // 卡片标题（iOS headline 观感）
    xl: 22, // 页面标题
    display: 30, // 唯一的大数字
  },
  line: { tight: 1.25, base: 1.5, loose: 1.7 },
  weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
};

// ========================================
// 间距 / 圆角 / 投影 / 动效
// ========================================
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

/**
 * 圆角分级 —— iOS 观感的核心是"大圆角 + 同心"
 * 同心规则：外层圆角 = 内层圆角 + 内边距。侧边栏 20 - 内边距 8 = 内层 12。
 */
export const radius = {
  sm: 8, // 按钮、输入框、标签
  md: 12, // 卡内小面板、列表项
  lg: 16, // 卡片
  xl: 20, // 悬浮侧边栏、弹窗
  pill: 999, // 状态点、胶囊
};

/**
 * 投影 —— iOS 用"低对比 + 大扩散"的柔和投影表达层级。
 * （之前我把投影全砍了，那是过度矫正：大屏下整页只剩白底细线，显得没做完。）
 */
export const shadow = {
  card: "0 1px 2px rgba(0, 0, 0, 0.04), 0 6px 20px rgba(0, 0, 0, 0.05)",
  float: "0 4px 12px rgba(0, 0, 0, 0.06), 0 16px 40px rgba(0, 0, 0, 0.10)",
  inset: "inset 0 1px 0 rgba(255, 255, 255, 0.6)",
};

export const motion = {
  fast: "150ms",
  base: "220ms",
  slow: "420ms",
  // 只过渡这几个属性 —— 绝不写 `transition: all`
  ease: "cubic-bezier(0.22, 0.61, 0.36, 1)",
};

// ========================================
// antd 主题
// ========================================
export const antdTheme = {
  token: {
    colorPrimary: color.primary,
    colorLink: color.primary,
    colorError: color.danger,
    colorSuccess: color.success,
    colorWarning: color.warning,

    colorBgLayout: color.bg,
    colorBgContainer: color.surface,
    colorBgElevated: color.surface,

    colorText: color.fg,
    colorTextSecondary: color.fgMuted,
    colorTextTertiary: color.fgFaint,
    colorTextDescription: color.fgMuted,

    colorBorder: color.borderStrong,
    colorBorderSecondary: color.border,
    colorFillTertiary: color.surface2,
    colorFillSecondary: color.surface3,

    fontFamily: font.ui,
    fontSize: font.size.base,
    borderRadius: radius.md,
    borderRadiusLG: radius.lg,
    borderRadiusSM: radius.sm,
    controlHeight: 34,

    // iOS 观感：控件不压边、留白偏多
    paddingContentHorizontal: 14,

    // 投影恢复成 iOS 式柔和浮起（不再全站 none）
    boxShadow: shadow.card,
    boxShadowSecondary: shadow.float,
    boxShadowTertiary: shadow.card,

    // 表格：iOS 分组列表观感
    tableHeaderBg: "transparent",
    tableHeaderColor: color.fgFaint,
    tableRowHoverBg: color.surface2,
    tableBorderColor: color.border,
  },
  components: {
    Layout: {
      bodyBg: "transparent",
      headerBg: "transparent",
      siderBg: "transparent",
    },
    Menu: {
      itemBg: "transparent",
      itemColor: color.fgMuted,
      itemHoverBg: color.surface2,
      itemHoverColor: color.fg,
      itemSelectedBg: color.primarySoft,
      itemSelectedColor: color.fg,
      itemBorderRadius: radius.md,
      itemHeight: 40,
      itemMarginInline: 8,
      itemMarginBlock: 2,
      iconSize: 17,
      collapsedIconSize: 18,
      activeBarWidth: 0, // 选中态只用底色，不要左侧竖条（更接近 iOS）
    },
    Card: {
      borderRadiusLG: radius.lg,
      paddingLG: space.lg,
      headerBg: "transparent",
      headerFontSize: font.size.lg,
      colorBorderSecondary: color.border,
    },
    Button: {
      borderRadius: radius.sm,
      primaryShadow: "none",
      defaultShadow: "none",
      fontWeight: 500,
    },
    Table: {
      headerBg: "transparent",
      headerSplitColor: "transparent",
      rowHoverBg: color.surface2,
    },
    Input: { borderRadius: radius.sm, paddingBlock: 6 },
    Select: { borderRadius: radius.sm },
    Modal: { borderRadiusLG: radius.xl },
    Tag: { borderRadiusSM: radius.pill },
    Segmented: { itemSelectedBg: color.surface, trackBg: color.surface3 },
  },
};
