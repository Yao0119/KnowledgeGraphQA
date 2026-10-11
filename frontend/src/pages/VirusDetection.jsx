/**
 * 病毒检测 —— 文件投递 + 扫描报告
 *
 * 交互设计（沿用项目既有的 iOS 单色毛玻璃体系，不引入任何新色板）：
 *   空态     一个虚线"投递槽"，拖拽或点选文件
 *   已选文件  样本卡（扩展名徽标 + 等宽文件名 + 体积/类型/修改时间）+ 开始检测
 *   扫描中   投递槽变为扫描面板（横向光带 + 进度 + 四个阶段清单）
 *   有结论   结论横幅（唯一承载语义色的地方）+ 扫描信息 + 引擎明细表
 *
 * 关于后端：
 *   项目原有接口 `POST /api/virus-detection` 只接受文件名与类型，并不接收文件内容；
 *   而"上传文件"需要一个 multipart 接口。该接口**尚未实现**，所以这里默认走前端
 *   模拟流程（见 USE_UPLOAD_API 开关），保证 demo 可离线跑通。
 *   唯一"真实"的一步是 SHA-256：用浏览器 WebCrypto 直接读取本地文件算出摘要，
 *   结论再由摘要确定性地推导 —— 同一个文件每次得到同样的结果，方便反复演示。
 */

import { useEffect, useRef, useState } from "react";
import { Button, Card, Progress, Segmented, Space, Table, Tag, Tooltip, Typography, message } from "antd";
import {
  CheckCircleOutlined,
  CloseOutlined,
  CloudUploadOutlined,
  LoadingOutlined,
  ScanOutlined,
  WarningOutlined,
} from "@ant-design/icons";

import api, { errorMessage } from "../api";

const { Title, Text, Paragraph } = Typography;

/** 单文件上限。演示用，超过就不读进内存了 */
const MAX_FILE_SIZE = 100 * 1024 * 1024;
/** EICAR 标准测试文件的 SHA-256：杀软行业通用的"无害假病毒"，命中即按恶意出具报告 */
const EICAR_SHA256 = "275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f";

/**
 * 是否调用真实上传接口。
 * 后端尚未实现 `POST /api/virus-detection/upload`（multipart/form-data，字段名 file），
 * 后端就绪后把这里改成 true，前端就会把文件真正提交上去，其余逻辑不用动。
 */
const USE_UPLOAD_API = false;

/** 检测阶段。前三个阶段与后端 scan_results 的引擎一一对应 */
const SCAN_STAGES = [
  { key: "hash", label: "计算文件指纹", detail: "SHA-256" },
  { key: "static", label: "静态特征匹配", detail: "文件结构 · 入口点" },
  { key: "sandbox", label: "行为沙箱", detail: "隔离环境观察" },
  { key: "signature", label: "特征码库比对", detail: "已知样本特征" },
];

const THREAT_LABEL = { High: "高", Medium: "中", Low: "低" };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 取扩展名（小写，不含点） */
function extOf(name = "") {
  const idx = name.lastIndexOf(".");
  if (idx <= 0 || idx === name.length - 1) return "";
  return name.slice(idx + 1).toLowerCase();
}

/** 样本卡左侧徽标文案：没有扩展名时回落成 FILE，而不是留空 */
function extLabel(name) {
  const ext = extOf(name);
  return ext ? ext.slice(0, 4).toUpperCase() : "FILE";
}

/** 人类可读体积 */
function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${i === 0 ? Math.round(value) : value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

/** 文件修改时间：扫描报告要能对上"哪个文件"，所以要显示到分钟 */
function formatTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 计算文件 SHA-256。
 * WebCrypto 只在安全上下文可用（http://localhost 算安全），拿不到时退化为
 * 基于文件元数据的轻量摘要 —— 演示流程不能因为跑在 http 的局域网地址上就崩掉。
 */
async function fileDigest(file) {
  try {
    if (globalThis.crypto?.subtle) {
      const buffer = await file.arrayBuffer();
      const hash = await globalThis.crypto.subtle.digest("SHA-256", buffer);
      return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    // 读取失败时静默退化，不打断演示
  }
  return fallbackDigest(`${file.name}|${file.size}|${file.lastModified}`);
}

/** FNV-1a 的简易扩展：只为生成稳定的 64 位十六进制标识，不是密码学摘要 */
function fallbackDigest(seed) {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < seed.length; i += 1) {
    const code = seed.charCodeAt(i);
    a = Math.imul(a ^ code, 16777619) >>> 0;
    b = Math.imul(b ^ (code + i), 2246822519) >>> 0;
  }
  const part = (n) => n.toString(16).padStart(8, "0");
  return `${part(a)}${part(b)}`.repeat(4).slice(0, 64);
}

function maliciousReport(file, digest, reason) {
  const signature = `Trojan.Win32.${digest.slice(0, 6)}.gen`;
  return {
    is_malicious: true,
    threat_level: "High",
    signature,
    reason,
    scan_results: [
      { engine: "静态分析", result: "入口点存在可疑的代码注入痕迹", status: "恶意" },
      { engine: "行为沙箱", result: "运行后尝试写入启动项并回连外部地址", status: "恶意" },
      { engine: "特征码库", result: `匹配 ${signature}`, status: "恶意" },
    ],
    summary: `文件 ${file.name} 命中已知恶意特征，建议立即隔离并删除。`,
  };
}

function cleanReport(file) {
  return {
    is_malicious: false,
    threat_level: "Low",
    signature: null,
    reason: null,
    scan_results: [
      { engine: "静态分析", result: "文件结构与节区正常", status: "安全" },
      { engine: "行为沙箱", result: "隔离环境中未观察到可疑行为", status: "安全" },
      { engine: "特征码库", result: "未匹配到已知病毒特征", status: "安全" },
    ],
    summary: `文件 ${file.name} 扫描完成，未发现明显威胁。`,
  };
}

/**
 * 演示结论：由文件摘要确定性推导（不是随机数，同一个文件结果稳定）。
 * outcome 是页面上的演示开关，用于在答辩时强制走通"恶意 / 安全"两条分支。
 */
function buildDemoVerdict(file, digest, outcome) {
  if (outcome === "malicious") {
    return maliciousReport(file, digest, "演示开关指定：按恶意样本出具报告");
  }
  if (outcome === "clean") return cleanReport(file);
  if (digest === EICAR_SHA256) {
    return maliciousReport(file, digest, "命中 EICAR 标准测试特征");
  }
  const bucket = Number.parseInt(digest.slice(0, 2), 16) % 100;
  return bucket < 32
    ? maliciousReport(file, digest, "指纹落入演示用的高风险区间")
    : cleanReport(file);
}

/** 真实上传（后端就绪后启用）：multipart/form-data，字段名 file */
async function requestScanFromServer(file) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/api/virus-detection/upload", form);
  return data;
}

export default function VirusDetection() {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeStage, setActiveStage] = useState(-1);
  const [doneStages, setDoneStages] = useState(0);
  const [report, setReport] = useState(null);
  // 演示开关：auto 按指纹判定，malicious / clean 强制结论
  const [outcome, setOutcome] = useState("auto");

  const inputRef = useRef(null);
  const aliveRef = useRef(true);
  // 每次扫描自增，用来让"上一轮扫描"在用户中途换文件 / 离开页面后自动作废
  const runIdRef = useRef(0);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      runIdRef.current += 1;
    };
  }, []);

  const uploadNote = USE_UPLOAD_API
    ? "文件将提交到后端扫描服务"
    : "文件只在本机读取，不会上传到任何服务";

  /** 接收一个文件：校验 → 清掉上一轮的结论 */
  const acceptFile = (picked) => {
    if (!picked) return;
    if (picked.size === 0) {
      message.warning("这是一个空文件，换一个有内容的文件再试");
      return;
    }
    if (picked.size > MAX_FILE_SIZE) {
      message.warning(`文件超过 ${formatSize(MAX_FILE_SIZE)}，演示流程不处理过大的文件`);
      return;
    }
    setFile(picked);
    setReport(null);
    setProgress(0);
    setActiveStage(-1);
    setDoneStages(0);
  };

  const openPicker = () => {
    if (!scanning) inputRef.current?.click();
  };

  const clearFile = () => {
    runIdRef.current += 1; // 作废可能还在跑的扫描
    setFile(null);
    setReport(null);
    setScanning(false);
    setProgress(0);
    setActiveStage(-1);
    setDoneStages(0);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (scanning) return;
    const dropped = e.dataTransfer?.files;
    if (!dropped?.length) return;
    if (dropped.length > 1) message.info("演示一次只处理一个文件，已取第一个");
    acceptFile(dropped[0]);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!scanning && !dragging) setDragging(true);
  };

  const handleDragLeave = (e) => {
    // 移进子元素也会触发 dragleave，要确认真的离开了整个槽位
    if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
  };

  const runScan = async () => {
    if (!file || scanning) return;
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    // 本轮是否还有效（组件没卸载、且没有被更新的扫描 / 移除动作取代）
    const stillCurrent = () => aliveRef.current && runId === runIdRef.current;

    const startedAt = performance.now();
    setScanning(true);
    setReport(null);
    setProgress(0);
    setDoneStages(0);
    setActiveStage(0);

    try {
      // 阶段一：真的算摘要
      const digest = await fileDigest(file);
      if (!stillCurrent()) return;
      setDoneStages(1);
      setProgress(Math.round((1 / SCAN_STAGES.length) * 100));
      setActiveStage(1);

      let verdict;
      if (USE_UPLOAD_API) {
        // 真实接口一次返回结论，四个阶段在等待期间保持"进行中"的观感，回来后一起收尾
        verdict = await requestScanFromServer(file);
        if (!stillCurrent()) return;
        setDoneStages(SCAN_STAGES.length);
        setProgress(100);
      } else {
        // 阶段二~四：本地演示，逐个走完
        for (let i = 1; i < SCAN_STAGES.length; i += 1) {
          setActiveStage(i);
          await sleep(340 + i * 150);
          if (!stillCurrent()) return;
          setDoneStages(i + 1);
          setProgress(Math.round(((i + 1) / SCAN_STAGES.length) * 100));
        }
        verdict = buildDemoVerdict(file, digest, outcome);
      }

      if (!stillCurrent()) return;
      setProgress(100);
      setActiveStage(-1);
      setReport({
        ...verdict,
        digest,
        size: file.size,
        durationMs: Math.round(performance.now() - startedAt),
      });
      if (verdict.is_malicious) message.error("检测到威胁！");
      else message.success("文件安全");
    } catch (err) {
      if (stillCurrent()) message.error(errorMessage(err, "检测失败，请稍后重试"));
    } finally {
      if (stillCurrent()) setScanning(false);
    }
  };

  const columns = [
    {
      title: "检测引擎",
      dataIndex: "engine",
      key: "engine",
      width: 132,
      render: (value) => <span style={{ fontWeight: 500 }}>{value}</span>,
    },
    { title: "检测结果", dataIndex: "result", key: "result" },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 96,
      align: "right",
      render: (status) => <Tag color={status === "恶意" ? "red" : "green"}>{status}</Tag>,
    },
  ];

  const detectedCount = report?.scan_results?.filter((r) => r.status === "恶意").length ?? 0;

  return (
    // width:100% 不能省：本页是 .app-inner（flex 列容器）的子项，
    // 只写 max-width + margin:auto 时 auto 外边距会顶掉 align-items:stretch，
    // 容器会收缩成内容宽度（实测 2560 窗口下卡片只有 384px 宽、浮在空白里还偏右）。
    // boxSizing 显式写成 border-box：全站没有全局 border-box 重置（刻意不引 preflight），
    // content-box 下 100% + 24px 内边距会再溢出 48px。
    <div
      style={{
        padding: "24px",
        width: "100%",
        maxWidth: "1000px",
        margin: "0 auto",
        boxSizing: "border-box",
      }}
    >
      <div style={{ marginBottom: "28px", textAlign: "center" }}>
        <Title level={2} style={{ fontWeight: 700, marginBottom: "8px" }}>
          病毒检测
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          把可疑文件拖进来，检查它是否携带病毒、木马、蠕虫等恶意代码
        </Paragraph>
        {/* 后端上传接口尚未实现，这句必须显式写出来，避免把模拟结论误当成真实扫描 */}
        {!USE_UPLOAD_API && (
          <Text type="secondary" style={{ fontSize: 12 }}>

          </Text>
        )}
      </div>

      <Card
        style={{
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 10px 30px var(--c-border)",
          border: "none",
        }}
      >
        {/* 隐藏的原生选择器：投递槽与按钮都通过它拉起系统文件对话框 */}
        <input
          ref={inputRef}
          type="file"
          hidden
          onChange={(e) => {
            acceptFile(e.target.files?.[0]);
            // 清空 value，否则连续选同一个文件不会再触发 change
            e.target.value = "";
          }}
        />

        {scanning ? (
          <div className="scan-plate is-busy">
            <div className="scan-plate-icon">
              <ScanOutlined spin style={{ fontSize: 22 }} />
            </div>
            <div className="scan-plate-title" role="status">
              正在扫描 {file?.name}
            </div>
            <div className="scan-plate-hint">{uploadNote}</div>

            <div style={{ width: "100%", maxWidth: 460, marginTop: 20 }}>
              <Progress
                percent={progress}
                status="active"
                strokeColor="var(--c-primary)"
                showInfo={false}
              />
              <div style={{ textAlign: "left", marginTop: 12 }}>
                {SCAN_STAGES.map((stage, i) => {
                  const done = i < doneStages;
                  const active = i === activeStage;
                  return (
                    <div
                      key={stage.key}
                      className={`scan-stage ${done ? "is-done" : ""} ${active ? "is-active" : ""}`}
                    >
                      <span className="scan-stage-mark">
                        {done ? (
                          <CheckCircleOutlined />
                        ) : active ? (
                          <LoadingOutlined spin />
                        ) : (
                          <span
                            className="dot"
                            style={{ width: 6, height: 6, background: "var(--c-line-faint)" }}
                          />
                        )}
                      </span>
                      <span>{stage.label}</span>
                      <span className="scan-stage-detail">{stage.detail}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : file ? (
          <>
            {/* 样本卡：扩展名徽标 + 等宽文件名（机器标识符一律等宽） */}
            <div className="scan-file">
              <div className="scan-file-badge">{extLabel(file.name)}</div>
              <div className="scan-file-main">
                <span className="scan-file-name" translate="no" title={file.name}>
                  {file.name}
                </span>
                <div className="scan-file-meta">
                  <span>{formatSize(file.size)}</span>
                  <span>{file.type || "未知类型"}</span>
                  <span>修改于 {formatTime(file.lastModified)}</span>
                </div>
              </div>
              <Tooltip title="移除文件">
                <Button
                  type="text"
                  shape="circle"
                  aria-label="移除文件"
                  icon={<CloseOutlined />}
                  onClick={clearFile}
                />
              </Tooltip>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 10,
                marginTop: 16,
              }}
            >
              <Button
                type="primary"
                size="large"
                icon={<ScanOutlined />}
                onClick={runScan}
                style={{
                  borderRadius: "var(--radius-lg)",
                  height: "46px",
                  padding: "0 32px",
                  fontSize: "15px",
                  fontWeight: 600,
                  boxShadow: "none",
                }}
              >
                {report ? "重新检测" : "开始检测"}
              </Button>
              <Button
                size="large"
                style={{ borderRadius: "var(--radius-lg)", height: "46px", padding: "0 20px" }}
                onClick={openPicker}
              >
                换一个文件
              </Button>

              {/* 演示开关：答辩时用来强制走通恶意 / 安全两条分支 */}
              <Space size={8} style={{ marginLeft: "auto" }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  演示结果
                </Text>
                <Segmented
                  size="small"
                  value={outcome}
                  onChange={setOutcome}
                  options={[
                    { label: "自动判定", value: "auto" },
                    { label: "恶意", value: "malicious" },
                    { label: "安全", value: "clean" },
                  ]}
                />
              </Space>
            </div>

            <Text
              type="secondary"
              style={{ fontSize: 12, display: "block", marginTop: 12 }}
            >
              {uploadNote}
            </Text>
          </>
        ) : (
          <div
            className={`scan-plate ${dragging ? "is-dragging" : ""}`}
            role="button"
            tabIndex={0}
            aria-label="选择要检测的文件"
            onClick={openPicker}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openPicker();
              }
            }}
            onDragEnter={handleDragOver}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="scan-plate-icon">
              <CloudUploadOutlined style={{ fontSize: 22 }} />
            </div>
            <div className="scan-plate-title">
              {dragging ? "松开即可开始检测" : "把文件拖到这里，或点击选择"}
            </div>
            <div className="scan-plate-hint">支持任意格式，检测过程不会执行文件本身</div>
            <div className="scan-plate-limit">
              单个文件，不超过 {formatSize(MAX_FILE_SIZE)}
            </div>
          </div>
        )}

        {report && !scanning && (
          <div style={{ marginTop: 28 }}>
            <div
              role="status"
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 12,
                padding: "18px 20px",
                borderRadius: "var(--radius-lg)",
                background: report.is_malicious
                  ? "var(--c-danger-soft)"
                  : "var(--c-success-soft)",
                border: `1px solid ${report.is_malicious ? "var(--c-danger)" : "var(--c-success)"}`,
              }}
            >
              {report.is_malicious ? (
                <WarningOutlined
                  style={{ fontSize: 24, color: "var(--c-danger)", flex: "none" }}
                />
              ) : (
                <CheckCircleOutlined
                  style={{ fontSize: 24, color: "var(--c-success)", flex: "none" }}
                />
              )}

              <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                <Title
                  level={4}
                  style={{
                    margin: 0,
                    color: report.is_malicious ? "var(--c-danger)" : "var(--c-success)",
                  }}
                >
                  {report.is_malicious ? "发现恶意软件" : "未发现威胁"}
                </Title>
                <Text>{report.summary}</Text>

                {/* 扫描信息：摘要用等宽显示 —— 它是要和样本库对账的机器标识符 */}
                <div className="scan-recap">
                  <span>SHA-256</span>
                  <Tooltip title={report.digest}>
                    <span className="mono ident" translate="no">
                      {report.digest.slice(0, 16)}…{report.digest.slice(-8)}
                    </span>
                  </Tooltip>
                  <span>· {formatSize(report.size)}</span>
                  <span>· 耗时 {(report.durationMs / 1000).toFixed(1)} 秒</span>
                  {report.is_malicious && (
                    <span>· 引擎检出 {detectedCount}/{report.scan_results.length}</span>
                  )}
                </div>
                {report.reason && (
                  <div className="scan-recap">判定依据：{report.reason}</div>
                )}
              </div>

              <Tag
                color={report.is_malicious ? "red" : "green"}
                style={{
                  fontSize: 13,
                  padding: "3px 12px",
                  borderRadius: "var(--radius-md)",
                  marginInlineEnd: 0,
                }}
              >
                威胁等级：{THREAT_LABEL[report.threat_level] ?? report.threat_level}
              </Tag>
            </div>

            <Title level={5} style={{ margin: "24px 0 12px" }}>
              详细检测报告
            </Title>
            <Table
              columns={columns}
              dataSource={report.scan_results}
              pagination={false}
              rowKey="engine"
              style={{
                borderRadius: "var(--radius-lg)",
                overflow: "hidden",
                border: "1px solid var(--c-surface2)",
              }}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
