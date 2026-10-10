/**
 * 系统概览（首页）
 *
 * 为什么要有这个文件：
 *   原来 `App.jsx` 里是 `<Route index element={<Navigate to="graph" replace />} />`，
 *   也就是 `/dashboard` 直接跳到了 `/dashboard/graph` —— 侧边栏的「系统概览」
 *   和「知识图谱管理」看到的其实是同一个页面（用户反馈的"重复了"）。
 *   这里补上真正的首页：五个功能模块的简介入口。
 *
 * 排版参考用户给的 homework.html：
 *   hero 区（标签胶囊 + 大标题 + 说明 + 关键数字）→ 居中区块标题 → 等宽网格卡片，
 *   每张卡片右上角一个大号编号、悬停上浮。
 * 配色**不照搬**参考页（深色 + 紫色渐变），沿用项目的 iOS 黑白灰毛玻璃。
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DatabaseOutlined,
  ApartmentOutlined,
  BugOutlined,
  QuestionCircleOutlined,
  DeploymentUnitOutlined,
  ArrowRightOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { API_BASE } from "../api";

/**
 * 五个功能模块。
 * desc 里写的是这个模块**实际能做什么**（含真实数据规模与交互方式），
 * 不用"赋能/一站式"这类空话——简介页最容易退化成营销文案。
 */
const FEATURES = [
  {
    to: "/dashboard/graph",
    icon: DatabaseOutlined,
    title: "知识图谱管理",
    desc: "浏览中文图谱的实体与关系。全库 170 万节点、243 万关系无法一次画完，按病毒种子抽样展开邻域；可新建、编辑、删除节点，并查看三元组样例。",
  },
  {
    to: "/dashboard/graph-dual",
    icon: ApartmentOutlined,
    title: "中英双层对照",
    desc: "中文图谱与英文图谱左右并列，两层之间只有核心病毒节点存在 ALIGN_WITH 映射。在任一侧点击节点，另一侧会自动定位到它对应的映射节点。",
  },
  {
    to: "/dashboard/virus",
    icon: BugOutlined,
    title: "病毒检测",
    desc: "提交样本名称或特征，结合图谱中的家族、运行环境、威胁行为等信息，判断是否命中已知恶意软件并给出依据。",
  },
  {
    to: "/dashboard/qa",
    icon: QuestionCircleOutlined,
    title: "问答检索",
    desc: "用自然语言提问，答案由图谱检索与大模型组织生成，并保留可溯源的实体与关系，便于核对结论来自哪些数据。",
  },
  {
    to: "/dashboard/reasoning",
    icon: DeploymentUnitOutlined,
    title: "系统推理",
    desc: "基于图谱做多步推理，输出结论及其推理链路，用于复核判断依据，而不是只给一个结果。",
  },
];

export default function Home() {
  const navigate = useNavigate();
  // 两个接口各管一件事：/api/health 给服务状态，
  // 节点/关系总数在 /api/graph/summary（GraphManager 与个人资料页也是这么取的）
  const [stats, setStats] = useState(null);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    let alive = true;
    // 失败就静默降级，不在首页弹错误（外壳顶部已有服务状态条）
    fetch(`${API_BASE}/api/health`)
      .then((r) => r.json())
      .then((d) => alive && setStats(d))
      .catch(() => {});
    fetch(`${API_BASE}/api/graph/summary`)
      .then((r) => r.json())
      .then((d) => alive && setSummary(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="enter">
      {/* ---------- hero 区 ---------- */}
      <section className="home-hero">
        <span className="home-tag">
          <SafetyCertificateOutlined aria-hidden="true" />
          Neo4j 知识图谱驱动的安全分析
        </span>

        <h2 className="home-title">知识图谱安全分析平台</h2>

        <p className="home-sub">
          把恶意软件的家族、运行环境、厂商别名、威胁行为、变种、解决方案等信息组织成图谱，
          支持中英文双层对照检索与推理。左侧五个模块分别对应图谱管理、跨语言对照、
          样本检测、问答检索与多步推理。
        </p>

        {summary && (
          <div className="home-stats">
            <div>
              <div className="home-stat-value">
                {/* /api/graph/summary 的返回是嵌套的：{success, data:{nodes, relationships}} */}
                {Number(summary.data?.nodes ?? 0).toLocaleString()}
              </div>
              <div className="home-stat-label">图谱节点</div>
            </div>
            <div>
              <div className="home-stat-value">
                {Number(summary.data?.relationships ?? 0).toLocaleString()}
              </div>
              <div className="home-stat-label">关系</div>
            </div>
            <div>
              <div className="home-stat-value">
                {stats?.overall === "healthy" ? "正常" : "降级"}
              </div>
              <div className="home-stat-label">系统状态</div>
            </div>
          </div>
        )}
      </section>

      {/* ---------- 功能模块卡片 ---------- */}
      <div className="section-title">
        <h2>功能模块</h2>
        <p>点击任意卡片进入对应模块</p>
      </div>

      <div className="feature-grid">
        {FEATURES.map((f, i) => {
          const Icon = f.icon;
          return (
            <button
              key={f.to}
              type="button"
              className="feature-card"
              onClick={() => navigate(f.to)}
            >
              {/* 大号编号：参考页卡片的标志性元素 */}
              <span className="feature-num" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>

              <span className="feature-icon">
                <Icon aria-hidden="true" />
              </span>

              <span className="feature-title">{f.title}</span>
              <span className="feature-desc">{f.desc}</span>

              <span className="feature-more">
                进入模块
                <ArrowRightOutlined aria-hidden="true" style={{ fontSize: 12 }} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
