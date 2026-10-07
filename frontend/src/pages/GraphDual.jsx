/**
 * 中英双层对照图谱页
 *
 * 页面结构（左右两个独立的 vis-network 实例）：
 *
 *   ┌──────────────────────────┬──────────────────────────┐
 *   │  中文图谱  lang = 'cn'    │  英文图谱  lang = 'en'    │
 *   │  (关系名：病毒家族/运行环境)│  (关系名：Family/Platform) │
 *   │                          │                          │
 *   │  属性节点 ──▶ 核心节点    │    核心节点 ──▶ 属性节点   │
 *   └──────────────────────────┴──────────────────────────┘
 *                        ↑ 两个核心节点贴在一起
 *
 * 两个面板的层级方向刻意相反（左 RL / 右 LR），核心节点因此分别靠右侧和左侧，
 * 隔着中间的分隔线相邻 —— 直观表达"中英两层只有核心节点之间存在 ALIGN_WITH 映射"。
 *
 * 联动：在任一面板点击节点，会按 norm_name 在另一面板找到"同一个实体"
 * 并高亮（青色描边），下方同时给出中英两侧的属性对比。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import {
  ApiOutlined,
  LinkOutlined,
  ReloadOutlined,
  SwapOutlined,
} from "@ant-design/icons";

import { Network } from "vis-network";

import api, { errorMessage } from "../api";
import {
  NODE_COLORS,
  TEXT_NODE_TYPES,
  buildNetworkOptions,
  getNodeColor,
  toVisData,
} from "../graphTheme";

const { Text, Title } = Typography;

/** 单层最多渲染多少条关系（subgraph 太大既看不清也拖慢浏览器） */
const EDGE_LIMIT = 120;

/** 病毒下拉最多加载多少个候选 */
const VIRUS_LIST_LIMIT = 300;

/** 面板高度 */
const PANEL_HEIGHT = 460;

export default function GraphDual() {
  const [virusList, setVirusList] = useState([]);
  const [virus, setVirus] = useState(null);
  const [layers, setLayers] = useState(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState(null);

  // 当前选中节点：{ norm_name, label, name_orig, lang, type }
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 是否在图上显示 Solution/Behavior/Description 这类超长句子的节点。
  // 默认关闭：它们占全部节点约 72%、名字是整句中文，放进图里会把布局撑爆，
  // 而且真正的 实体-关系-实体 结构会被淹没。全文仍可在下方"节点对照"里看到。
  const [showTextNodes, setShowTextNodes] = useState(false);

  // 每层实际渲染的节点/边数量，以及被隐藏的文本节点数（用于界面上说明）
  const [graphCounts, setGraphCounts] = useState({ cn: null, en: null });

  const cnContainerRef = useRef(null);
  const enContainerRef = useRef(null);
  const cnNetworkRef = useRef(null);
  const enNetworkRef = useRef(null);

  // 节点 elementId → 节点数据，供点击时反查 norm_name / label
  const nodeIndexRef = useRef({ cn: new Map(), en: new Map() });

  // -------------------------
  // 加载可对照的病毒列表
  // -------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setListLoading(true);
      try {
        const res = await api.get("/api/graph/malware-list", {
          params: { limit: VIRUS_LIST_LIMIT },
        });
        const list = res.data?.data ?? [];
        if (cancelled) return;
        setVirusList(list);
        if (list.length && !virus) {
          setVirus(list[0].name);
        }
        if (!list.length) {
          setError(
            "图谱里没有可用于中英对照的病毒 —— 需要核心节点之间已建立 ALIGN_WITH 映射。"
          );
        }
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, "加载对照病毒列表失败"));
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // virus 只用于"首次自动选中"，不加入依赖，避免重复拉列表
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------
  // 加载双层子图
  // -------------------------
  const loadLayers = useCallback(async (name) => {
    if (!name) return;
    setLoading(true);
    setError(null);
    setSelected(null);
    setDetail(null);
    try {
      const res = await api.get("/api/graph/layers", {
        params: { virus: name, limit: EDGE_LIMIT },
      });
      const data = res.data?.data;
      if (!data) {
        setLayers(null);
        setError(res.data?.message || "没有取到双层数据");
      } else {
        setLayers(data);
      }
    } catch (err) {
      setLayers(null);
      setError(errorMessage(err, "加载双层图谱失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (virus) loadLayers(virus);
  }, [virus, loadLayers]);

  // -------------------------
  // 点击节点 → 拉中英对照详情
  // -------------------------
  const handleNodeClick = useCallback(async (nodeId, lang) => {
    const node = nodeIndexRef.current[lang]?.get(nodeId);
    if (!node) return;
    setSelected({
      norm_name: node.norm_name,
      label: node.label,
      name_orig: node.name_orig,
      lang: node.lang,
      type: node.type,
    });

    if (!node.norm_name) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    try {
      const res = await api.get("/api/graph/node-detail", {
        params: { norm_name: node.norm_name },
      });
      setDetail(res.data?.data ?? null);
    } catch (err) {
      message.error(errorMessage(err, "获取节点详情失败"));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // -------------------------
  // 渲染左（中文）/ 右（英文）两个网络
  // -------------------------
  // linkedNorm：另一面板中"同名实体"的 norm_name，用于跨面板联动高亮。
  // selected 在 cn 层 → 右面板要找同名节点；反之亦然。
  const selectedNorm = selected?.norm_name ?? null;

  useEffect(() => {
    if (!layers) return;
    const paired = {
      cn: toVisData(layers.cn, {
        coreId: layers.core?.cn,
        selectedNorm: selected?.lang === "cn" ? selectedNorm : null,
        linkedNorm: selected?.lang === "en" ? selectedNorm : null,
        hideTextNodes: !showTextNodes,
      }),
      en: toVisData(layers.en, {
        coreId: layers.core?.en,
        selectedNorm: selected?.lang === "en" ? selectedNorm : null,
        linkedNorm: selected?.lang === "cn" ? selectedNorm : null,
        hideTextNodes: !showTextNodes,
      }),
    };

    nodeIndexRef.current = {
      cn: new Map((layers.cn?.nodes || []).map((n) => [n.id, n])),
      en: new Map((layers.en?.nodes || []).map((n) => [n.id, n])),
    };

    /**
     * 建好网络后自适应缩放
     *
     * 不能只调一次 fit()：层级布局在首帧还在收敛，过早 fit 会按尚未定型的位置计算，
     * 导致图形偏出画布。这里在绘制完成后连调两次（第二帧再校正一次）更稳。
     */
    const fitLater = (net) => {
      const doFit = () =>
        net.fit({ animation: { duration: 220, easingFunction: "easeInOutQuad" } });
      setTimeout(doFit, 80);
      setTimeout(doFit, 420);
    };

    // ---- 中文面板：核心节点应在右侧 → direction: "RL" ----
    if (cnContainerRef.current) {
      cnNetworkRef.current?.destroy();
      const net = new Network(
        cnContainerRef.current,
        paired.cn,
        buildNetworkOptions("RL")
      );
      net.on("click", ({ nodes }) => {
        if (nodes.length === 1) handleNodeClick(nodes[0], "cn");
      });
      cnNetworkRef.current = net;
      fitLater(net);
    }

    // ---- 英文面板：核心节点应在左侧 → direction: "LR" ----
    if (enContainerRef.current) {
      enNetworkRef.current?.destroy();
      const net = new Network(
        enContainerRef.current,
        paired.en,
        buildNetworkOptions("LR")
      );
      net.on("click", ({ nodes }) => {
        if (nodes.length === 1) handleNodeClick(nodes[0], "en");
      });
      enNetworkRef.current = net;
      fitLater(net);
    }

    // 两个面板的节点/边数量差异，用于提示被隐藏的文本节点
    setGraphCounts({
      cn: {
        shown: paired.cn.nodes.length,
        hidden: paired.cn.hiddenTextCount,
        edges: paired.cn.edges.length,
      },
      en: {
        shown: paired.en.nodes.length,
        hidden: paired.en.hiddenTextCount,
        edges: paired.en.edges.length,
      },
    });

    return () => {
      cnNetworkRef.current?.destroy();
      cnNetworkRef.current = null;
      enNetworkRef.current?.destroy();
      enNetworkRef.current = null;
    };
  }, [layers, selected, selectedNorm, showTextNodes, handleNodeClick]);

  // 组件卸载时清理
  useEffect(
    () => () => {
      cnNetworkRef.current?.destroy();
      enNetworkRef.current?.destroy();
    },
    []
  );

  // -------------------------
  // 图例（只列出当前两层真正出现的类型）
  // -------------------------
  const legendTypes = useMemo(() => {
    if (!layers) return [];
    const seen = new Set();
    [...(layers.cn?.nodes || []), ...(layers.en?.nodes || [])].forEach((n) =>
      seen.add(n.type)
    );
    return [...seen].sort();
  }, [layers]);

  const cnCoreLabel = useMemo(() => {
    const id = layers?.core?.cn;
    return id ? nodeIndexRef.current.cn.get(id)?.label : null;
  }, [layers]);

  // -------------------------
  // 属性对比表
  // -------------------------
  const renderDetailSide = (side, langLabel) => {
    if (detailLoading) {
      return (
        <div style={{ padding: 24, textAlign: "center" }}>
          <Spin />
        </div>
      );
    }
    if (!detail?.[side]) {
      return (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={`${langLabel}层没有同名实体`}
        />
      );
    }
    const node = detail[side];
    return (
      <Descriptions
        size="small"
        column={1}
        bordered
        items={[
          { key: "name", label: "名称", children: node.label },
          { key: "type", label: "类型", children: <Tag color={getNodeColor(node.type)}>{node.type}</Tag> },
          {
            key: "orig",
            label: "源数据原值",
            children: node.name_orig ?? "-",
          },
          {
            key: "labels",
            label: "标签",
            children: (node.labels || []).join(" / "),
          },
          ...Object.entries(node.properties || {})
            .filter(([k]) => !["name", "name_orig", "lang", "norm_name", "label", "id"].includes(k))
            .map(([k, v]) => ({
              key: k,
              label: k,
              children: String(v).length > 300 ? `${String(v).slice(0, 300)}…` : String(v),
            })),
        ]}
      />
    );
  };

  return (
    <div style={{ padding: "0 4px" }}>
      {/* ---------- 顶部控制条 ---------- */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap size="middle" style={{ width: "100%" }}>
          <Text strong>中英双层对照</Text>
          <Select
            showSearch
            style={{ width: 380 }}
            placeholder="选择要对照的恶意软件（中英两层都有）"
            loading={listLoading}
            value={virus}
            onChange={setVirus}
            optionFilterProp="label"
            options={virusList.map((v) => ({
              value: v.name,
              label: `${v.name}（${v.mal_type ?? "?"}・${v.degree} 条关系）`,
            }))}
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => loadLayers(virus)}
            disabled={!virus}
          >
            重新加载
          </Button>
          <Tooltip title="解决方案 / 病毒行为 / 综合描述 这类节点的名字是整句中文（最长上百字），放进图里会把布局撑坏。关闭时它们不显示在图上，但下方「节点对照」仍能看到全文。">
            <Space size={6}>
              <Switch
                size="small"
                checked={showTextNodes}
                onChange={setShowTextNodes}
              />
              <Text style={{ fontSize: 13 }}>显示文本节点（句子）</Text>
            </Space>
          </Tooltip>
          {layers?.matched ? (
            <Tag icon={<LinkOutlined />} color="cyan">
              核心节点已映射（ALIGN_WITH）
            </Tag>
          ) : layers ? (
            <Tag color="orange">该病毒未建立跨层映射</Tag>
          ) : null}
        </Space>
      </Card>

      {error ? (
        <Alert type="warning" showIcon message={error} style={{ marginBottom: 12 }} />
      ) : null}

      <Spin spinning={loading}>
        {!layers ? (
          <Card>
            <Empty description="请选择上方的一个恶意软件" />
          </Card>
        ) : (
          <>
            {/* ---------- 左右双面板 ---------- */}
            {/* ⚠️ 这里不能放"独立的分隔线元素"：Ant Design 的 Row 是 flex-wrap 容器，
                两个 Col 各占 50%，再插一个带边框的 div 就变成 50% + 2px + 50% > 100%，
                会触发换行，英文面板整块被挤到下一行、在屏幕上直接看不见。
                所以改成：虚线直接画在右列自己的 border-left 上（border-box 不会撑宽），
                中间的 ALIGN_WITH 圆形标识用绝对定位，完全不参与布局计算。 */}
            <Row gutter={0} align="stretch" style={{ position: "relative" }}>
              <Col span={12}>
                <Card
                  size="small"
                  title={
                    <Space>
                      <Badge color="#007aff" />
                      <span>中文图谱</span>
                      <Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>
                        lang = cn ・ 关系名：病毒家族 / 运行环境 / 解决方案 …
                      </Text>
                    </Space>
                  }
                  styles={{ body: { padding: 0 } }}
                >
                  <div
                    ref={cnContainerRef}
                    style={{ height: PANEL_HEIGHT, overflow: "hidden" }}
                  />
                </Card>
              </Col>

              <Col span={12} style={{ borderLeft: "2px dashed #d9d9d9" }}>
                <Card
                  size="small"
                  title={
                    <Space>
                      <Badge color="#ff3b30" />
                      <span>英文图谱</span>
                      <Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>
                        lang = en ・ 关系名：Family / Platform / Solution …
                      </Text>
                    </Space>
                  }
                  styles={{ body: { padding: 0 } }}
                >
                  <div
                    ref={enContainerRef}
                    style={{ height: PANEL_HEIGHT, overflow: "hidden" }}
                  />
                </Card>
              </Col>

              {/* ALIGN_WITH 标识：绝对定位居中，不占布局宽度 */}
              <Tooltip title="两层之间只有核心节点存在 ALIGN_WITH 映射">
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    background: "#fff",
                    border: "1px solid #d9d9d9",
                    borderRadius: "50%",
                    width: 34,
                    height: 34,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 3,
                  }}
                >
                  <SwapOutlined style={{ color: "#22d3ee" }} />
                </div>
              </Tooltip>
            </Row>

            {/* ---------- 核心节点映射条 ---------- */}
            <Card size="small" style={{ marginTop: 12 }}>
              <Space wrap>
                <ApiOutlined style={{ color: "#22d3ee" }} />
                <Text strong>核心节点映射</Text>
                {layers.matched ? (
                  <>
                    <Tag color="#007aff">中文层</Tag>
                    <Text code>{cnCoreLabel ?? layers.virus}</Text>
                    <Text type="secondary">──ALIGN_WITH──▶</Text>
                    <Tag color="#ff3b30">英文层</Tag>
                    <Text code>{layers.virus}</Text>
                  </>
                ) : (
                  <Text type="secondary">
                    该病毒只存在于单层（中英两个源文件的病毒集合并不完全相同）
                  </Text>
                )}
                <Text type="secondary" style={{ marginLeft: 8 }}>
                  中文层 {graphCounts.cn?.shown ?? 0} 节点 / {graphCounts.cn?.edges ?? 0} 关系 ・
                  英文层 {graphCounts.en?.shown ?? 0} 节点 / {graphCounts.en?.edges ?? 0} 关系
                  {(graphCounts.cn?.hidden ?? 0) + (graphCounts.en?.hidden ?? 0) > 0
                    ? `（另有 ${(graphCounts.cn?.hidden ?? 0) + (graphCounts.en?.hidden ?? 0)} 个文本节点已隐藏）`
                    : ""}
                </Text>
              </Space>
            </Card>

            {/* ---------- 图例 ---------- */}
            {legendTypes.length ? (
              <Card size="small" style={{ marginTop: 12 }} title="节点类型图例">
                <Space wrap size={[12, 8]}>
                  {legendTypes.map((t) => (
                    <Space key={t} size={6}>
                      <span
                        style={{
                          display: "inline-block",
                          width: 12,
                          height: 12,
                          borderRadius: 3,
                          background: NODE_COLORS[t] || "#94a3b8",
                          border: "1px solid rgba(0,0,0,0.15)",
                        }}
                      />
                      <Text style={{ fontSize: 13 }}>{t}</Text>
                    </Space>
                  ))}
                </Space>
              </Card>
            ) : null}

            {/* ---------- 选中节点的中英属性对比 ---------- */}
            <Card
              size="small"
              style={{ marginTop: 12, marginBottom: 12 }}
              title={
                selected ? (
                  <Space wrap>
                    <span>节点对照</span>
                    <Tag color={selected.lang === "cn" ? "#007aff" : "#ff3b30"}>
                      {selected.lang === "cn" ? "点击自中文层" : "点击自英文层"}
                    </Tag>
                    <Text code>{selected.label}</Text>
                    {selected.name_orig && selected.name_orig !== selected.label ? (
                      <Text type="secondary">（源数据原值 {selected.name_orig}）</Text>
                    ) : null}
                  </Space>
                ) : (
                  "节点对照（在左右任一图中单击一个节点）"
                )
              }
            >
              {!selected ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="单击图中任意节点，这里会并排显示它在中文层与英文层的属性"
                />
              ) : (
                <Row gutter={16}>
                  <Col span={12}>
                    <Title level={5} style={{ color: "#007aff" }}>
                      中文层
                    </Title>
                    {renderDetailSide("cn", "中文")}
                  </Col>
                  <Col span={12}>
                    <Title level={5} style={{ color: "#ff3b30" }}>
                      英文层
                    </Title>
                    {renderDetailSide("en", "英文")}
                  </Col>
                </Row>
              )}
            </Card>
          </>
        )}
      </Spin>
    </div>
  );
}
