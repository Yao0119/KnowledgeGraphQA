import { useEffect, useRef, useState } from "react";
import {
  Card,
  Table,
  message,
  Spin,
  Button,
  Modal,
  Form,
  Input,
  Tag,
  Select,
  Switch,
  Space,
  Tooltip,
  notification,
  Divider,
} from "antd";
import {
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  PlusOutlined,
  ClusterOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  ApartmentOutlined,
  TableOutlined,
} from "@ant-design/icons";

import { Network } from "vis-network";

import api, { errorMessage, isAdmin } from "../api";
// 配色与布局统一由 graphTheme 提供，两个图谱页面共用一份，避免改一处忘一处。
// 背景：后端 node_display_type() 修好之后，节点类型不再全是 "Entity"，
// 而是会返回恶意软件家族（Virus/Trojan/Worm…）或领域标签（Family/Platform/Solution…），
// 旧页面里那张只有 6 种颜色的表已覆盖不到，这里换成完整配色表。
import { getNodeColor, truncateLabel, NODE_TYPES } from "../graphTheme";
import { color, space, radius, font } from "../theme";

// -------------------------
// 支持的节点类型
// -------------------------
// 保留 NODE_LABELS 这个名字：新建节点表单的默认值、图例、类型下拉三处都在用它。
// 内容换成新 schema 的真实类型集合（含 :Malware 的家族标签与 Family/Platform/…），
// 旧的 ["Virus","System","File","Attack","Behavior","Entity"] 是上一版 schema 的遗留，
// 其中 System/File/Attack/Entity 在当前图谱里根本不会出现。
const NODE_LABELS = NODE_TYPES;

// -------------------------
// 颜色函数（保留原函数名，现有调用点无需改动）
// -------------------------
const getColorByLabel = (label) => getNodeColor(label);

// 后端地址已统一到 src/api.js（相对路径 /api + Vite 代理），此处不再硬编码 host。

export default function GraphManager() {
  const [stats, setStats] = useState({ nodes: 0, relationships: 0 });
  const [sample, setSample] = useState([]);
  const [loading, setLoading] = useState(true);
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [isFullscreen, setIsFullscreen] = useState(false);

  const networkRef = useRef(null);
  const visRef = useRef(null);
  const graphCardRef = useRef(null);
  // 缩放按钮的操作句柄（由 vis-network 初始化时写入，避免把 network 实例提到组件作用域）
  const zoomControlsRef = useRef(null);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingNode, setEditingNode] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form] = Form.useForm();

  // -------------------------
  // 可视化采样参数
  // -------------------------
  // 旧实现是后端 `MATCH (n)-[r]->(m) LIMIT 200`。因为 rels.csv 是**按关系类型分组**
  // 导入的（前 25 万行全是「威胁类型」），Neo4j 走关系扫描只会取到同一种关系的边 ——
  // 实测 200 条边仅连出 207 个节点、关系种类 = 1，画出来是 200 个各自只挂 1 根刺的
  // 孤立小星形，看起来就是"实体怎么这么少"。
  // 现在后端改成"以 N 个恶意软件为种子展开邻域"，25 个种子即可得到
  // 约 443 个节点 / 11 种关系的连通子图。下面这几个参数就是给它用的。
  const [seeds, setSeeds] = useState(25); // 种子数量（决定样本规模）
  const [offset, setOffset] = useState(0); // 种子偏移（"换一批"）
  // 是否隐藏句子型节点。默认 true：这类节点（解决方案 / 病毒行为 / 综合描述）
  // 占全库约 72%，一画出来就把真正的实体结构淹没成一团毛线。
  const [hideText, setHideText] = useState(true);
  // 是否在节点与关系上显示文字标签。默认 false：
  // 几百个节点同时贴标签会互相压住、完全读不了；名字改由悬停气泡与下方表格呈现。
  const [showLabels, setShowLabels] = useState(false);
  const [meta, setMeta] = useState(null); // 后端返回的采样信息

  // -------------------------
  // 加载数据
  // -------------------------
  const loadData = async (opts = {}) => {
    // 允许调用方覆盖采样参数（"换一批"、改样本规模、切"只看实体"）
    const useSeeds = opts.seeds ?? seeds;
    const useOffset = opts.offset ?? offset;
    const useHideText = opts.hideText ?? hideText;

    setLoading(true);
    try {
      const [statsRes, sampleRes, graphRes] = await Promise.all([
        api.get("/api/graph/summary"),
        api.get("/api/graph/samples"),
        api.get("/api/graph/full", {
          params: {
            seeds: useSeeds,
            offset: useOffset,
            hide_text: useHideText,
            limit: 2000,
          },
        }),
      ]);

      const statsPayload = statsRes.data?.data ?? statsRes.data;
      const rawStats = { nodes: 0, relationships: 0, ...statsPayload };
      setStats({
        nodes: rawStats.nodes ?? 0,
        relationships: rawStats.relationships ?? 0,
      });

      const samplePayload = sampleRes.data?.data ?? sampleRes.data;
      const tripleList = Array.isArray(samplePayload?.data) ? samplePayload.data : (samplePayload?.data ?? []);
      setSample(tripleList);

      const graphPayload = graphRes.data?.data ?? graphRes.data;
      const rawNodes = graphPayload?.nodes ?? [];
      const rawEdges = graphPayload?.edges ?? [];
      const nodes = rawNodes.map((n) => ({
        id: n.id,
        name: n.label ?? n.name ?? String(n.id),
        label: n.type ?? n.label ?? "Node",
      }));
      const edges = rawEdges.map((e) => ({
        source: e.from ?? e.source,
        target: e.to ?? e.target,
        type: e.label ?? e.type,
      }));

      setGraphData({ nodes, edges });
      setMeta(graphPayload?.meta ?? null);
      setSeeds(useSeeds);
      setOffset(useOffset);
      setHideText(useHideText);

      // 说明清楚"图上显示的是抽样，不是全库"，避免误解成图谱只有这么点东西
      const meta0 = graphPayload?.meta ?? {};
      notification.success({
        message: `已加载 ${nodes.length} 个节点 / ${edges.length} 条关系`,
        description:
          `抽样方式：${meta0.seed_count ?? useSeeds} 个病毒种子展开邻域` +
          // 范围用普通连字符（破折号是全站禁用字符）
          `（第 ${useOffset + 1}-${useOffset + (meta0.seed_count ?? useSeeds)} 个，共 ${meta0.total_malware ?? "?"} 个病毒）。` +
          `全库共 ${rawStats.nodes} 节点 / ${rawStats.relationships} 关系，` +
          `170 万节点的图谱无法一次画完，所以按种子抽样。`,
        placement: "bottomRight",
        duration: 6,
      });
    } catch (err) {
      console.error(err);
      message.error("❌ 无法连接后端或 Neo4j，图谱为空");
      setGraphData({ nodes: [], edges: [] });
      setSample([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);
  // -------------------------
  // 全屏逻辑
  // -------------------------
  const toggleFullscreen = () => {
    const element = graphCardRef.current;
    if (!element) return;

    if (!isFullscreen) {
      element.requestFullscreen?.();
      element.webkitRequestFullscreen?.();
    } else {
      document.exitFullscreen?.();
      document.webkitExitFullscreen?.();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const full =
        document.fullscreenElement || document.webkitFullscreenElement;
      setIsFullscreen(!!full);

      if (visRef.current) {
        setTimeout(() => {
          visRef.current.redraw();
          visRef.current.fit();
        }, 100);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener(
      "webkitfullscreenchange",
      handleFullscreenChange
    );

    return () => {
      document.removeEventListener(
        "fullscreenchange",
        handleFullscreenChange
      );
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange
      );
    };
  }, []);

  // -------------------------
  // 初始化 vis-network
  // -------------------------
  useEffect(() => {
    if (!networkRef.current) return;
    const { nodes, edges } = graphData;

    if (nodes.length === 0) {
      visRef.current?.destroy();
      visRef.current = null;
      return;
    }

    const visNodes = nodes.map((n) => ({
      id: n.id,
      // 标签默认不画（见 showLabels 注释）。打开时才截断显示：
      // 句子型节点名最长上百字，原样当标签画会把整张图撑爆。
      label: showLabels ? truncateLabel(n.name) : undefined,
      group: n.label,
      color: getColorByLabel(n.label),
      shape: "dot",
      size: 14,
      widthConstraint: { maximum: 170 },
      // ⚠️ 画布颜色必须是**字面量**：vis-network 把字符串直接交给 canvas 的
      //    fillStyle，而 canvas 不解析 CSS 变量 —— 写 var(--c-fg) 等于颜色设置失败
      //    （表现为文字沿用上一个填充色，看起来发浅蓝/发灰）。
      font: { color: "#1C1C1E", size: 13 },
      // 原始名字留给"显示标签"开关做增量更新，避免为了开关重建整个图（会重跑物理布局）
      __rawName: n.name,
      title: `名称: ${n.name}<br/>类型: ${n.label}<br/>双击可编辑`,
    }));

    const visEdges = edges.map((e) => ({
      from: e.source,
      to: e.target,
      // 关系标签同理：502 条边同时贴"威胁类型/解决方案…"就是文字汤
      label: showLabels ? e.type : undefined,
      // 留给"显示标签"开关做增量更新
      __rawType: e.type,
      arrows: "to",
      font: { size: 11, align: "middle", color: "#6E6E73" },
      color: "#C7C7CC",
    }));

    const data = { nodes: visNodes, edges: visEdges };

    const options = {
      layout: { improvedLayout: true },
      physics: {
        enabled: true,
        // ⚠️ 原来写的是 `stabilization: true`，等于用默认设置且不限迭代次数：
        // 几百个节点的力导向稳定可能要跑十几秒，稳定结束前 fit() 不会执行，
        // 画布一直空白 —— 用户看到的就是"图没出来"。这里限定迭代次数，
        // 并显式开启 stabilization.fit。
        stabilization: {
          enabled: true,
          iterations: 250,
          updateInterval: 25,
          fit: true,
        },
        barnesHut: {
          gravitationalConstant: -12000,
          springLength: 140,
          avoidOverlap: 0.2,
        },
      },
      interaction: { hover: true, dragView: true, zoomView: true, tooltipDelay: 120 },
      edges: { smooth: true },
    };

    visRef.current?.destroy();
    const network = new Network(networkRef.current, data, options);
    visRef.current = network;

    // 开发期调试句柄：方便在浏览器控制台里检查 getScale() / getViewPosition()，
    // 或用 __kgNetwork.setOptions({physics:{enabled:false}}) 手动冻结布局。
    // 生产构建（import.meta.env.DEV === false）不会挂载。
    if (import.meta.env.DEV) {
      window.__kgNetwork = network;
    }

    // ==================== 缩放 / 平移：显式接管 ====================
    // 实测（Chrome 154 + vis-network 10.1.2）：
    //   * interactionHandler.options 里 zoomView/dragView 都是 true，配置没问题；
    //   * canvas 上确实绑了 wheel 监听器（passive:false），滚轮时也调用了
    //     preventDefault（页面没被滚动），但 camera 的 scale 就是不变 ——
    //     vis-network 自带的缩放通路在这个环境里走不通。
    // 与其继续猜它的内部原因，不如自己接管滚轮：行为完全可控，也能验证。
    const MIN_SCALE = 0.12; // 允许的最小缩放（再小就完全看不清）
    const MAX_SCALE = 3.5;  // 允许的最大缩放

    /** 以鼠标位置为中心缩放（和地图软件的手感一致） */
    const zoomAt = (factor, clientX, clientY) => {
      const rect = networkRef.current?.getBoundingClientRect();
      if (!rect) return;
      const current = network.getScale();
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current * factor));
      if (next === current) return;

      // 把"鼠标指向的图坐标点"保持在鼠标下方：先取该点在缩放前的位置，再按新比例反推视角
      const domPoint = { x: clientX - rect.left, y: clientY - rect.top };
      const graphPoint = network.DOMtoCanvas(domPoint);
      const offsetX = (domPoint.x - rect.width / 2) / next;
      const offsetY = (domPoint.y - rect.height / 2) / next;
      network.moveTo({
        scale: next,
        position: {
          x: graphPoint.x - offsetX,
          y: graphPoint.y - offsetY,
        },
        animation: false,
      });
    };

    const onWheel = (event) => {
      // passive:false 才能阻止浏览器把滚轮当成页面滚动
      event.preventDefault();
      const factor = Math.pow(1.12, event.deltaY < 0 ? 1 : -1);
      zoomAt(factor, event.clientX, event.clientY);
    };

    const container = networkRef.current;
    container.addEventListener("wheel", onWheel, { passive: false });

    /** 供页面右上角按钮调用 */
    zoomControlsRef.current = {
      in: () => {
        const r = container.getBoundingClientRect();
        zoomAt(1.25, r.left + r.width / 2, r.top + r.height / 2);
      },
      out: () => {
        const r = container.getBoundingClientRect();
        zoomAt(1 / 1.25, r.left + r.width / 2, r.top + r.height / 2);
      },
    };

    // ==================== 自适应缩放：不要缩到看不清 ====================
    // `fit()` 在 400+ 节点时会把 scale 压到 0.1 左右，字号 15px 的标签实际只有 1.5px，
    // 整张图成了一小撮点 —— 用户即使滚轮有效也会觉得"放不大"。
    // 这里给 fit 的结果设一个下限。
    const MIN_FIT_SCALE = 0.35;
    const fitReadable = () => {
      try {
        network.fit({ animation: false });
        const s = network.getScale();
        if (s < MIN_FIT_SCALE) {
          // 保持 fit 后的中心，只把比例提到可读下限
          network.moveTo({ scale: MIN_FIT_SCALE, animation: false });
        }
      } catch {
        /* 网络已销毁时忽略 */
      }
    };

    // 稳定过程中先给一个可读的视图，避免长时间空白画布
    setTimeout(fitReadable, 200);
    // 稳定结束后：再校一次视图，并**关掉物理引擎**让图彻底静止，
    // 否则节点持续抖动会让缩放/拖拽感觉"不跟手"。
    network.once("stabilizationIterationsDone", () => {
      try {
        network.setOptions({ physics: { enabled: false } });
      } catch {
        /* ignore */
      }
      fitReadable();
    });

    // 单击节点高亮
    network.on("click", ({ nodes: clickedNodes, edges: clickedEdges }) => {
      const allNodes = network.body.data.nodes.get();
      const allEdges = network.body.data.edges.get();

      if (clickedNodes.length === 0) {
        // 空白区域，恢复默认
        network.body.data.nodes.update(
          allNodes.map((n) => ({ id: n.id, color: getColorByLabel(n.group) }))
        );
        network.body.data.edges.update(allEdges.map((e) => ({ id: e.id, color: "var(--c-fg-faint)" })));
        return;
      }

      const selectedNodeId = clickedNodes[0];

      const updatedNodes = allNodes.map((n) => ({
        id: n.id,
        // ⚠️ 画布颜色必须字面量，不能写 var(--c-*)：canvas 不解析 CSS 变量。
        //    选中态用近黑（与全站主色一致），原来这里是橙色 #ff9800（杂色）
        color: n.id === selectedNodeId ? "#1C1C1E" : "#E5E5EA",
      }));

      const updatedEdges = allEdges.map((e) => ({
        id: e.id,
        color:
          // 同上：字面量，且选中边用近黑而不是橙色
          e.from === selectedNodeId || e.to === selectedNodeId ? "#1C1C1E" : "#E5E5EA",
      }));

      network.body.data.nodes.update(updatedNodes);
      network.body.data.edges.update(updatedEdges);
    });

    // 双击编辑节点
    network.on("doubleClick", ({ nodes: dblNodes }) => {
      if (dblNodes.length !== 1) return;
      const target = graphData.nodes.find((n) => n.id === dblNodes[0]);
      if (!target) return;

      setEditingNode(target);
      form.setFieldsValue(target);
      setIsModalVisible(true);
    });

    // 清理：移除自己绑的滚轮监听，并销毁网络实例。
    // 注意原实现这个 effect 没有 cleanup，重跑时会残留监听器与旧 network。
    return () => {
      container.removeEventListener("wheel", onWheel);
      zoomControlsRef.current = null;
      try {
        visRef.current?.destroy();
      } catch {
        /* 已销毁 */
      }
      visRef.current = null;
      if (import.meta.env.DEV && window.__kgNetwork === network) {
        window.__kgNetwork = null;
      }
    };

  }, [graphData]);

  /**
   * 标签开关：**增量更新**节点/边的 label，而不是重建整个图。
   * 重建会重跑物理布局，图会整体"跳"一下重新排布，体验很差。
   */
  useEffect(() => {
    const net = visRef.current;
    const dsNodes = net?.body?.data?.nodes;
    const dsEdges = net?.body?.data?.edges;
    if (!dsNodes || !dsEdges) return;
    dsNodes.update(
      dsNodes.get().map((n) => ({
        id: n.id,
        label: showLabels ? truncateLabel(n.__rawName ?? "") : undefined,
      }))
    );
    dsEdges.update(
      dsEdges.get().map((e) => ({
        id: e.id,
        label: showLabels ? e.__rawType : undefined,
      }))
    );
  }, [showLabels]);

  // -------------------------
  // 新建/编辑节点
  // -------------------------
  const handleCreateNode = () => {
    setEditingNode(null);
    form.resetFields();
    form.setFieldsValue({ label: NODE_LABELS[0] });
    setIsModalVisible(true);
  };

  const handleUpsertNode = async () => {
    if (!isAdmin()) {
      message.warning("只有管理员可以修改知识图谱");
      return;
    }
    try {
      const values = await form.validateFields();
      setIsSubmitting(true);

      if (editingNode) {
        await api.put(`/api/kg/node/${editingNode.id}`, {
          name: values.name,
        });
        message.success("✅ 节点更新成功");
      } else {
        await api.post("/api/kg/node", {
          name: values.name,
          label: values.label,
        });
        message.success("✨ 新建节点成功");
      }

      setIsModalVisible(false);
      loadData();
    } catch (err) {
      console.error(err);
      // FastAPI 的错误字段是 detail，原实现读的是 error，所以永远只显示兜底文案
      message.error(`操作失败: ${errorMessage(err, "请检查网络和后端API")}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteNode = () => {
    if (!isAdmin()) {
      message.warning("只有管理员可以修改知识图谱");
      return;
    }
    Modal.confirm({
      title: "⚠️ 确认删除节点？",
      content: `删除节点 [${editingNode.name}] 将同时删除所有关联关系，操作不可恢复！`,
      okText: "确认删除",
      okType: "danger",
      onOk: async () => {
        try {
          await api.delete(`/api/kg/node/${editingNode.id}`);
          message.success("🗑️ 节点已删除");
          setIsModalVisible(false);
          loadData();
        } catch (err) {
          message.error(errorMessage(err, "删除失败"));
        }
      },
    });
  };

  // -------------------------
  // 图例
  // 原来是 position:absolute 浮在画布上，会遮住右侧节点且被裁切；
  // 改成画布下方的一行可换行条带：不遮挡、不用点开关、宽屏自动铺开。
  // （这里的彩色圆点是**节点类型颜色**，属于用户明确保留的"图谱节点颜色"）
  // -------------------------
  const Legend = () => {
    return (
      <div
        style={{
          marginTop: 12,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "6px 14px",
        }}
      >
        <span className="metric-label" style={{ marginRight: 2 }}>图例</span>
        {NODE_LABELS.map((l) => (
          <span
            key={l}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "var(--c-fg-muted)",
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: getColorByLabel(l),
                flex: "none",
              }}
            />
            {l}
          </span>
        ))}
      </div>
    );
  };

  // -------------------------
  // 渲染
  // -------------------------
  return (
    <Spin spinning={loading} tip="加载中...">
      <div className="space-y-5">

        {/* 统计卡片 */}

        {/* 1. 统计卡片 (移除新建按钮) */}

        <div className={`panel ${isFullscreen ? "hidden" : ""}`} style={{ marginBottom: space.xl }}>
          <div className="panel-head">
            <ClusterOutlined style={{ fontSize: 15, color: color.fgMuted }} />
            图谱概览
          </div>
          {/* 两个数字并排，并且**适配面板宽度**：
              格子用 1fr 铺满（之前把列宽上限写成 220px，2560 屏上右侧一大片空白）；
              内部改成"标签靠左、数字靠右"，这样格子再宽也是有意为之的行式布局，
              而不是把一个大数字孤零零丢在左边。 */}
          <div
            style={{
              padding: space.lg,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: `${space.lg}px ${space.xxl}px`,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <span className="metric-label">节点总数</span>
              <span className="metric">{Number(stats.nodes).toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <span className="metric-label">关系总数</span>
              <span className="metric">{Number(stats.relationships).toLocaleString()}</span>
            </div>
          </div>
        </div>


        {/* 图谱卡片 */}
        <Card
          ref={graphCardRef}
          title={
            <div className="flex items-center w-full">
              <span style={{display: "inline-flex", alignItems: "center", gap: 8, fontSize: font.size.lg, fontWeight: font.weight.semibold, color: color.fg}}>
                <ApartmentOutlined style={{ color: color.fgMuted }} />
                图谱可视化
              </span>
              <div className="ml-auto flex gap-3">
                <Button
                  icon={<PlusOutlined />}
                  type="primary"
                  onClick={handleCreateNode}
                >
                  新建节点
                </Button>

                {/* ---- 采样参数：170 万节点的图谱不可能一次画完，只能按种子抽样 ---- */}
                <Select
                  value={seeds}
                  style={{ width: 132 }}
                  onChange={(v) => loadData({ seeds: v, offset: 0 })}
                  options={[
                    { value: 10, label: "10 个病毒" },
                    { value: 25, label: "25 个病毒" },
                    { value: 40, label: "40 个病毒" },
                    { value: 80, label: "80 个病毒" },
                  ]}
                />
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => loadData({ offset: offset + seeds })}
                  className="rounded-lg"
                >
                  换一批
                </Button>
                <Tooltip title="解决方案 / 病毒行为 / 综合描述 这类节点占全库约 72%，名字还是整句中文（最长上百字）。关闭后只保留 实体-关系-实体 结构，图更清爽。">
                  <Space size={6} style={{ cursor: "help" }}>
                    <Switch
                      size="small"
                      checked={hideText}
                      onChange={(v) => loadData({ hideText: v })}
                    />
                    <span style={{ fontSize: 13, color: "var(--c-fg-muted)" }}>只看实体</span>
                  </Space>
                </Tooltip>

                <Tooltip title="显示每个节点与关系上的文字。几百个节点同时贴标签会互相压住、读不了，所以默认关闭；不显示时把鼠标停在节点上仍能看到完整名称。">
                  <Space size={6} style={{ cursor: "help" }}>
                    <Switch
                      size="small"
                      checked={showLabels}
                      onChange={setShowLabels}
                    />
                    <span style={{ fontSize: 13, color: "var(--c-fg-muted)" }}>显示标签</span>
                  </Space>
                </Tooltip>

                <Button icon={<ReloadOutlined />} onClick={() => loadData()} className="rounded-lg">
                  重新加载
                </Button>
                {/* 缩放按钮：滚轮已显式接管，这里再给一个不依赖滚轮的入口。
                    纯图标按钮必须有可访问名称（aria-label），否则屏幕阅读器只念出
                    "按钮"；Tooltip 只提供视觉提示，不能替代名称。 */}
                <Tooltip title="放大（也可以直接在图上滚动滚轮）">
                  <Button
                    aria-label="放大"
                    icon={<ZoomInOutlined aria-hidden="true" />}
                    onClick={() => zoomControlsRef.current?.in()}
                    className="rounded-lg"
                  />
                </Tooltip>
                <Tooltip title="缩小">
                  <Button
                    aria-label="缩小"
                    icon={<ZoomOutOutlined aria-hidden="true" />}
                    onClick={() => zoomControlsRef.current?.out()}
                    className="rounded-lg"
                  />
                </Tooltip>
                <Button
                  icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                  onClick={toggleFullscreen}
                  className="rounded-lg"
                >
                  {isFullscreen ? "退出全屏" : "全屏"}
                </Button>
              </div>
            </div>
          }
          className={`panel ${isFullscreen ? "fixed inset-0 z-[1000] w-full h-full p-0 m-0" : ""}`}
          styles={{ body: { padding: 16 } }}
        >
          {/* 抽样说明：避免把"图上只有几百个节点"误解成"图谱只有这么点东西" */}
          {meta ? (
            <div
              style={{
                marginBottom: 10,
                padding: "8px 12px",
                // 原先是 rgba(0,122,255,0.06) 旧 Apple 蓝 —— 单色主题下的杂色
                background: "var(--c-surface2)",
                border: "1px solid var(--c-border)",
                borderRadius: "var(--radius-md)",
                fontSize: 13,
                color: "var(--c-fg)",
              }}
            >
              当前显示 <b>{meta.node_count ?? graphData.nodes.length}</b> 个节点 /{" "}
              <b>{meta.edge_count ?? graphData.edges.length}</b> 条关系，
              按 <b>{meta.seed_count ?? seeds}</b> 个病毒种子展开邻域抽样
              （第 {offset + 1}-{offset + (meta.seed_count ?? seeds)} 个，共{" "}
              {meta.total_malware?.toLocaleString?.() ?? "?"} 个病毒）。
              全库共 {stats.nodes.toLocaleString()} 节点 / {stats.relationships.toLocaleString()} 关系，
              无法一次画完，请用「换一批」或调整种子数浏览。
              <br />
              操作：<b>滚轮缩放</b>（以鼠标位置为中心）、<b>拖拽平移</b>、单击节点高亮、双击节点编辑。
              {hideText ? " 已开启「只看实体」。" : ""}
            </div>
          ) : null}

          <div
            ref={networkRef}
            className="graph-canvas"
            style={{
              height: isFullscreen ? "calc(100vh - 64px)" : 520,
            }}
          />

          <Legend />
        </Card>

        {/* 三元组表格 */}
        <div className={`panel ${isFullscreen ? "hidden" : ""}`}>
          <div className="panel-head">
            <TableOutlined style={{ fontSize: 15, color: color.fgMuted }} />
            三元组样例
          </div>
          <div style={{ padding: space.md }}>
          <Table
            dataSource={sample}
            rowKey={(r) => JSON.stringify(r)}
            pagination={{ pageSize: 6, size: "small" }}
            size="small"
            // 去掉 bordered：密集表格里横线足够，竖线只会加噪
            columns={[
              // 源/目标节点名是机器标识符：等宽 + 省略 + translate="no"
              // （不让浏览器自动翻译改写病毒名，否则与数据对不上）；
              // 也不再给两侧各配一个彩色 Tag（全站已有 18 种节点类型色在竞争注意力）
              { title: "源节点", render: (_, r) => <span className="mono ident" translate="no" title={r.source?.name}>{r.source?.name}</span> },
              { title: "关系", render: (_, r) => <span className="mono ident" translate="no" title={r.relation} style={{ color: color.fgMuted }}>{r.relation}</span> },
              { title: "目标节点", render: (_, r) => <span className="mono ident" translate="no" title={r.target?.name}>{r.target?.name}</span> },
            ]}
          />
          </div>
        </div>
      </div>

      {/* 编辑/新建 Modal */}
      <Modal
        open={isModalVisible}
        title={<div className="text-xl font-semibold flex items-center gap-2 text-gray-800">{editingNode ? <EditOutlined /> : <PlusOutlined />}{editingNode ? `编辑节点: ${editingNode.name}` : "新建图谱节点"}</div>}
        onCancel={() => setIsModalVisible(false)}
        footer={[
          editingNode && (
            <Button key="delete" danger onClick={handleDeleteNode} icon={<DeleteOutlined />}>删除节点</Button>
          ),
          <Button key="cancel" onClick={() => setIsModalVisible(false)}>取消</Button>,
          <Button key="submit" type="primary" onClick={handleUpsertNode} loading={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700">
            {editingNode ? "保存更改" : "创建"}
          </Button>,
        ]}
      >
        <Form form={form} layout="vertical" initialValues={editingNode}>
          {editingNode && (
            <Form.Item label="ID" name="id">
              <Input disabled className="rounded-lg" />
            </Form.Item>
          )}
          <Form.Item label="类型" name="label" rules={[{ required: true, message: "请选择节点类型" }]}>
            {editingNode ? (
              <Input disabled className="rounded-lg" />
            ) : (
              <Select className="rounded-lg" placeholder="请选择节点类型">
                {NODE_LABELS.map(label => (
                  <Select.Option key={label} value={label}>
                    <Tag color={getColorByLabel(label)}>{label}</Tag>
                  </Select.Option>
                ))}
              </Select>
            )}
          </Form.Item>
          <Form.Item label="名称" name="name" rules={[{ required: true, message: "名称不能为空" }]}>
            <Input placeholder="请输入节点名称" className="rounded-lg" />
          </Form.Item>
        </Form>
      </Modal>
    </Spin>
  );
}
