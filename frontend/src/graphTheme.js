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
// 分组的意义不只是"好看"：
//   ① 恶意软件家族（核心节点）：暖色，是图上的主角
//   ② 实体（家族/平台/别名/类别/类型）：彩色，是真正的"实体-关系-实体"结构
//   ③ 文本与值（句子/日期/数量）：**统一压成中性灰阶**
//      —— 它们占全部节点的约 72%，却不是实体而是句子。给它们上彩色会
//         把真正有信息量的实体结构淹没在噪声里。
//
// ⚠️ 这里的值必须是**字面颜色**（hex），不能写 var(--c-*)：
//    vis-network 直接把这些字符串交给 canvas 的 fillStyle，
//    canvas 不解析 CSS 变量，写了等于颜色失效。
export const NODE_COLORS = {
  // ① 恶意软件家族（核心节点）
  Virus: "#EF4444",
  Trojan: "#F97316",
  Worm: "#EAB308",
  GrayWare: "#78716C",
  RiskWare: "#94A3B8",
  HackTool: "#EC4899",
  TestFile: "#A1A1AA",
  JunkFile: "#D4D4D8",
  Malware: "#DC2626",

  // ② 实体
  Family: "#3B82F6",
  Platform: "#10B981",
  Alias: "#0EA5E9",
  Category: "#8B5CF6",
  MalwareType: "#6366F1",

  // ③ 文本与值（中性灰，刻意退到背景）
  Solution: "#CBD5E1",
  Behavior: "#CBD5E1",
  Description: "#CBD5E1",
  DateValue: "#E2E8F0",
  CountValue: "#E2E8F0",
};

/** 未在配色表里的类型使用的兜底色 */
export const FALLBACK_COLOR = "#94A3B8";

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

/**
 * 边框语义 —— 全站统一的三种"强调"
 *
 * 这里刻意**不再用填充色表示选中**：节点填充色是数据（类型），
 * 一旦被选中就改填充色，用户就丢失了"这是什么类型"的信息。
 * 所以三种强调全部走边框宽度+颜色，填充始终保留数据类型色。
 */
/** 选中：近黑描边，最粗。中性色不会和任何数据类型色撞车 */
export const SELECTED_BORDER = "#0F0F10";
/** 跨层联动：琥珀色 —— 与全站"琥珀=跨层映射"的语义一致 */
export const LINKED_BORDER = "#D97706";
/** 核心节点（ALIGN_WITH 的锚点）：同样是琥珀色 */
export const CORE_BORDER = "#D97706";

/** 兼容旧命名（graphTheme 之外若还引用） */
export const SELECTED_COLOR = SELECTED_BORDER;
export const LINKED_COLOR = LINKED_BORDER;

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
      font: { size: 14, color: "#0F0F10", face: "system-ui, sans-serif" },
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

    // 填充色始终是数据类型色，绝不因为"选中/联动/核心"而改变 ——
    // 三种强调只走边框，这样用户随时能看出节点是什么类型
    let border = "#FFFFFF";
    let borderWidth = 1.5;
    const color = baseColor;

    if (isCore) {
      border = CORE_BORDER;
      borderWidth = 3;
    }
    if (isLinked) {
      border = LINKED_BORDER;
      borderWidth = 3.5;
    }
    if (isSelected) {
      // 选中优先级最高：近黑 + 最粗
      border = SELECTED_BORDER;
      borderWidth = 4.5;
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
        highlight: { background: color, border: SELECTED_BORDER },
        hover: { background: color, border: LINKED_BORDER },
      },
      borderWidth,
      // 核心节点画大一点，突出"两层只有它相连"
      size: isCore ? 26 : 18,
      font: { size: isCore ? 15 : 14, bold: isCore ? { color: "#0F0F10" } : undefined },
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
