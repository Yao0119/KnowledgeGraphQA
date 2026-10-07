/**
 * 图谱可视化共享主题
 *
 * 为什么需要这个文件：
 *   后端 `node_display_type()` 修好之后，节点类型不再全是 "Entity"，而是会返回
 *   恶意软件家族（Virus/Trojan/Worm...）或领域标签（Family/Platform/Solution...）。
 *   GraphManager 与 GraphDual 两个页面都要用同一套配色与布局参数，
 *   放在这里避免两处各写一份、改一处忘一处。
 */

// ========================================
// 节点类型 → 颜色
// ========================================
// 分三组，让"核心节点 / 实体 / 文本值"在视觉上一眼可分
export const NODE_COLORS = {
  // ① 恶意软件家族（核心节点，中英两层靠 ALIGN_WITH 相连的就是它们）
  Virus: "#f87171",
  Trojan: "#fb923c",
  Worm: "#fbbf24",
  GrayWare: "#a8a29e",
  RiskWare: "#94a3b8",
  HackTool: "#f472b6",
  TestFile: "#cbd5e1",
  JunkFile: "#e2e8f0",
  Malware: "#ef4444",

  // ② 实体（家族 / 平台 / 别名 / 类别）
  Family: "#60a5fa",
  Platform: "#34d399",
  Alias: "#38bdf8",
  Category: "#a78bfa",
  MalwareType: "#818cf8",

  // ③ 文本与值（句子节点 / 日期 / 数量）
  Solution: "#facc15",
  Behavior: "#c084fc",
  Description: "#7dd3fc",
  DateValue: "#fca5a5",
  CountValue: "#fdba74",
};

/** 未在配色表里的类型使用的兜底色 */
export const FALLBACK_COLOR = "#94a3b8";

/**
 * 全部节点类型（有序）
 *
 * 顺序有意义：GraphManager 新建节点时用 `NODE_TYPES[0]` 作默认值，
 * 所以把最常用的恶意软件家族放在最前面。
 * 这份列表必须与 NODE_COLORS 的键保持一致（下面有断言）。
 */
export const NODE_TYPES = [
  // ① 恶意软件家族（核心节点）
  "Virus",
  "Trojan",
  "Worm",
  "GrayWare",
  "RiskWare",
  "HackTool",
  "TestFile",
  "JunkFile",
  // ② 实体
  "Family",
  "Platform",
  "Alias",
  "Category",
  "MalwareType",
  // ③ 文本与值
  "Solution",
  "Behavior",
  "Description",
  "DateValue",
  "CountValue",
];

// 开发期一致性检查：类型列表与配色表必须一一对应，避免以后加类型时漏改一处
if (import.meta.env?.DEV) {
  const missingColor = NODE_TYPES.filter((t) => !(t in NODE_COLORS));
  const missingType = Object.keys(NODE_COLORS).filter((t) => !NODE_TYPES.includes(t));
  if (missingColor.length || missingType.length) {
    console.warn(
      "[graphTheme] NODE_TYPES 与 NODE_COLORS 不一致",
      { missingColor, missingType }
    );
  }
}

/** 节点被选中时的高亮色 */
export const SELECTED_COLOR = "#ff7a00";

/** 跨层联动时对面板对应节点的高亮色 */
export const LINKED_COLOR = "#22d3ee";

/**
 * "文本/值"类节点
 *
 * 图谱把「解决方案 / 病毒行为 / 综合描述」三段文本也做成了节点，它们合计占全部节点的
 * 约 72%，**节点名就是整句中文（最长的上百字）**。这类节点放进图里有两个致命问题：
 *   1. vis-network 会把超长标签渲染成极宽的方块，层级布局被撑爆、整张图糊掉；
 *   2. 它们对"看清实体之间的关系"没有帮助 —— 一个病毒挂 6 条解决方案、6 条行为，
 *      真正的 实体-关系-实体 结构（家族/平台/别名/类别）反而被淹没。
 * 所以默认在图上隐藏它们（数据仍在，下方"节点对照"面板照样能看全文），
 * 由页面上的开关控制是否显示。
 */
export const TEXT_NODE_TYPES = new Set([
  "Solution",
  "Behavior",
  "Description",
  "DateValue",
  "CountValue",
]);

/** 节点标签最多显示多少字符（超出截断，完整内容放在悬浮提示里） */
export const MAX_LABEL_LENGTH = 20;

/**
 * 截断过长的节点标签
 *
 * @param {unknown} value 原始名称
 * @param {number} max 最大字符数
 * @returns {string} 截断后的标签
 */
export function truncateLabel(value, max = MAX_LABEL_LENGTH) {
  const str = String(value ?? "");
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

/**
 * 取节点类型的颜色
 * @param {string} type 节点类型（后端 node_display_type 的返回值）
 * @returns {string} 十六进制色值
 */
export function getNodeColor(type) {
  return NODE_COLORS[type] || FALLBACK_COLOR;
}

// ========================================
// 布局参数
// ========================================

/**
 * 构建 vis-network 的 options
 *
 * 用**层级布局**而不是力导向的原因：本图谱的子图是"一个病毒 + 它的若干属性"
 * 这种星形结构，力导向会把它揉成一团、每次刷新位置还不一样；层级布局则是
 * 确定的、可读的。左面板用 RL、右面板用 LR，两个核心节点就会贴在一起、
 * 中间隔一条分隔线 —— 视觉上正好体现"只有核心节点相连"。
 *
 * @param {"LR"|"RL"} direction 层级方向：RL = 核心节点在右（左面板用），LR = 核心在左（右面板用）
 * @param {object} extra 额外覆盖的 options
 * @returns {object} vis-network options
 */
export function buildNetworkOptions(direction = "LR", extra = {}) {
  return {
    layout: {
      hierarchical: {
        enabled: true,
        direction,
        sortMethod: "directed",
        levelSeparation: 220,
        nodeSpacing: 78,
        treeSpacing: 110,
        blockShifting: true,
        edgeMinimization: true,
        parentCentralization: true,
      },
    },
    physics: { enabled: false },
    interaction: {
      hover: true,
      dragNodes: false, // 层级布局下拖动会破坏结构，禁掉更稳
      dragView: true,
      zoomView: true,
      tooltipDelay: 120,
    },
    edges: {
      arrows: { to: { enabled: true, scaleFactor: 0.7 } },
      smooth: { enabled: true, type: "cubicBezier", roundness: 0.4 },
      font: { size: 13, align: "middle", background: "rgba(255,255,255,0.75)" },
      color: { color: "#b8c2cc", highlight: "#5b6b7c" },
      width: 1.4,
    },
    nodes: {
      shape: "box",
      margin: 10,
      borderWidth: 1.5,
      font: { size: 14, color: "#111827", face: "system-ui, sans-serif" },
      shadow: { enabled: true, size: 4, x: 0, y: 1, color: "rgba(0,0,0,0.08)" },
    },
    ...extra,
  };
}

// ========================================
// 图数据转换
// ========================================

/**
 * 把后端 /api/graph/layers 的一层数据转成 vis-network 的 nodes/edges
 *
 * @param {{nodes: Array, edges: Array}} layer 单层图数据
 * @param {{coreId?: string|null, selectedNorm?: string|null, linkedNorm?: string|null, hideTextNodes?: boolean}} opts
 *        coreId       核心（恶意软件本体）节点的 elementId，会被强调
 *        selectedNorm 当前选中的 norm_name
 *        linkedNorm   另一面板联动过来的 norm_name
 *        hideTextNodes 是否隐藏 Solution/Behavior/Description 这类超长文本节点（默认 true）
 * @returns {{nodes: Array, edges: Array, hiddenTextCount: number}} vis-network 数据
 */
export function toVisData(layer, opts = {}) {
  const {
    coreId = null,
    selectedNorm = null,
    linkedNorm = null,
    hideTextNodes = true,
  } = opts;

  const allNodes = layer?.nodes || [];
  const rawNodes = hideTextNodes
    ? allNodes.filter((n) => !TEXT_NODE_TYPES.has(n.type))
    : allNodes;
  const hiddenTextCount = allNodes.length - rawNodes.length;

  // 只保留两端都还在的边，否则 vis-network 会为缺失端点报警告
  const keptIds = new Set(rawNodes.map((n) => n.id));

  const nodes = rawNodes.map((n) => {
    const baseColor = getNodeColor(n.type);
    const isCore = coreId != null && n.id === coreId;
    const isSelected = selectedNorm != null && n.norm_name === selectedNorm;
    const isLinked = linkedNorm != null && n.norm_name === linkedNorm;

    let border = "#ffffff";
    let borderWidth = 1.5;
    let color = baseColor;
    if (isLinked) {
      border = LINKED_COLOR;
      borderWidth = 3;
    }
    if (isSelected) {
      color = SELECTED_COLOR;
      border = "#ffffff";
      borderWidth = 3;
    }
    if (isCore && !isSelected) {
      border = "#111827";
      borderWidth = 3;
    }

    return {
      id: n.id,
      // 标签必须截断：句子型节点名可达上百字，不截断会把方块拉得极宽、布局直接崩掉
      label: truncateLabel(n.label),
      shape: "box",
      // 再兜一层宽度上限，保证任何情况下方块都不会宽到破坏布局
      widthConstraint: { maximum: 190 },
      color: {
        background: color,
        border,
        highlight: { background: color, border: SELECTED_COLOR },
        hover: { background: color, border: LINKED_COLOR },
      },
      borderWidth,
      // 核心节点画大一点，突出"两层只有它相连"
      size: isCore ? 26 : 18,
      font: { size: isCore ? 15 : 14, bold: isCore ? { color: "#111827" } : undefined },
      title: [
        `<b>${escapeHtml(n.label)}</b>`,
        `类型: ${escapeHtml(n.type ?? "-")}`,
        `语言层: ${n.lang === "cn" ? "中文" : n.lang === "en" ? "英文" : "-"}`,
        n.name_orig && n.name_orig !== n.label
          ? `源数据原值: ${escapeHtml(n.name_orig)}`
          : null,
        n.is_core ? "<i>核心节点（跨层映射的锚点）</i>" : null,
        "<i>单击查看中英对照</i>",
      ]
        .filter(Boolean)
        .join("<br/>"),
    };
  });

  const edges = (layer?.edges || [])
    .filter((e) => keptIds.has(e.from) && keptIds.has(e.to))
    .map((e, i) => ({
      id: `${e.from}->${e.to}#${i}`,
      from: e.from,
      to: e.to,
      label: e.label,
    }));

  return { nodes, edges, hiddenTextCount };
}

/**
 * 转义 HTML，避免节点名里的尖括号破坏 tooltip 结构
 * @param {unknown} value 原始值
 * @returns {string} 转义后的字符串
 */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
