import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Progress,
  Select,
  Spin,
  Typography,
  Upload,
  message,
} from "antd";
import {
  ArrowRightOutlined,
  CloudUploadOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import api, { errorMessage, getToken } from "../api";
import { useNavigate } from "react-router-dom";

const { Text } = Typography;

function statusLabel(status) {
  return {
    ready: "已就绪",
    processing: "构建中",
    failed: "构建失败",
    archived: "已归档",
  }[status] || status;
}

function GraphCard({ graph, selected, onSelect, onOpen }) {
  const buildJob = graph.build_job;
  const isBuilding = graph.status === "processing" || ["pending", "extracting", "building"].includes(buildJob?.status);

  return (
    <button
      type="button"
      className={`graph-directory-card ${selected ? "is-selected" : ""}`}
      onClick={() => (onOpen ? onOpen(graph.graph_id) : onSelect(graph.graph_id))}
      aria-pressed={selected}
    >
      <div className="graph-directory-card-head">
        <span className="graph-directory-icon" aria-hidden="true">
          <DatabaseOutlined />
        </span>
        <span className="graph-directory-status">{statusLabel(graph.status)}</span>
      </div>
      <span className="graph-directory-card-title">{graph.name}</span>
      <span className="graph-directory-card-desc">{graph.description || "暂无简介"}</span>
      <span className="graph-directory-card-meta">
        {Number(graph.node_count || 0).toLocaleString()} 节点
        <span aria-hidden="true"> · </span>
        {Number(graph.edge_count || 0).toLocaleString()} 关系
      </span>
      {isBuilding && buildJob ? (
        <span className="graph-directory-card-progress">
          <Progress percent={buildJob.progress || 0} size="small" showInfo={false} />
          <small>{buildJob.current_stage || "后台构建中"}</small>
        </span>
      ) : null}
      {graph.status === "failed" && buildJob?.error_message ? (
        <span className="graph-directory-card-error" title={buildJob.error_message}>
          {buildJob.error_message}
        </span>
      ) : null}
      <span className="graph-directory-card-action">
        {selected ? "当前图谱" : "查看图谱"}
        <ArrowRightOutlined aria-hidden="true" />
      </span>
    </button>
  );
}

export default function GraphDirectoryPanel({ selectedGraphId, onSelect, onOpen, autoSelect = true }) {
  const navigate = useNavigate();
  const [graphs, setGraphs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileList, setFileList] = useState([]);
  const [jobByGraph, setJobByGraph] = useState({});
  const [form] = Form.useForm();

  const loadGraphs = async () => {
    if (!getToken()) {
      navigate("/login", { replace: true });
      return;
    }
    setLoading(true);
    try {
      const res = await api.get("/api/graphs");
      const list = res.data?.data ?? [];
      setGraphs(list);
      setJobByGraph((current) => {
        const next = { ...current };
        list.forEach((graph) => {
          if (graph.build_job) next[graph.graph_id] = graph.build_job;
        });
        return next;
      });
      if (autoSelect && !selectedGraphId && list[0]?.graph_id) onSelect(list[0].graph_id);
    } catch (err) {
      if (err?.response?.status === 401) {
        navigate("/login", { replace: true });
        return;
      }
      setError(errorMessage(err, "图谱目录加载失败"));
    } finally {
      setLoading(false);
    }
  };

  const pollBuildJob = async (jobId, graphId) => {
    const poll = async () => {
      try {
        const res = await api.get(`/api/graph-build-jobs/${jobId}`);
        const job = res.data?.data;
        if (job) {
          setJobByGraph((current) => ({ ...current, [graphId]: job }));
          if (["ready", "failed", "cancelled"].includes(job.status)) {
            await loadGraphs();
            return;
          }
        }
        window.setTimeout(poll, 1200);
      } catch {
        // 短暂网络波动不打断任务；下一次刷新目录时仍能看到后端状态。
      }
    };
    poll();
  };

  const handleUpload = async () => {
    const values = await form.validateFields();
    const file = fileList[0];
    if (!file) {
      message.warning("请先选择 TXT 或 Markdown 文件");
      return;
    }

    const payload = new FormData();
    payload.append("file", file);
    payload.append("name", values.name.trim());
    payload.append("description", values.description?.trim() || "");
    payload.append("language_mode", values.language_mode || "dual");

    setUploading(true);
    try {
      const res = await api.post("/api/graphs/build", payload);
      const data = res.data?.data;
      setUploadOpen(false);
      form.resetFields();
      setFileList([]);
      await loadGraphs();
      if (data?.graph_id && data?.job_id) {
        onSelect?.(data.graph_id);
        pollBuildJob(data.job_id, data.graph_id);
      }
      message.success("文件已接收，图谱正在后台构建");
    } catch (err) {
      message.error(errorMessage(err, "图谱构建任务创建失败"));
    } finally {
      setUploading(false);
    }
  };

  const displayGraphs = graphs.map((graph) => ({
    ...graph,
    build_job: jobByGraph[graph.graph_id] || graph.build_job,
  }));

  useEffect(() => {
    loadGraphs();
    // 只在页面初次进入时选择默认图谱
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSelect, navigate, onSelect, selectedGraphId]);

  const builtIn = useMemo(() => displayGraphs.filter((graph) => graph.is_builtin), [displayGraphs]);
  const mine = useMemo(() => displayGraphs.filter((graph) => !graph.is_builtin), [displayGraphs]);

  return (
    <section className="graph-directory" aria-labelledby="graph-directory-title">
      <div className="graph-directory-heading">
        <div>
          <div className="eyebrow">知识图谱工作区</div>
          <h2 id="graph-directory-title">先选图谱，再开始分析</h2>
          <p>每个图谱拥有独立的数据范围。当前选中的图谱会同步到可视化、双层对照和问答检索。</p>
        </div>
        <Button icon={<CloudUploadOutlined />} type="primary" onClick={() => setUploadOpen(true)}>
          上传文本创建图谱
        </Button>
      </div>

      {error ? <Alert type="error" showIcon message={error} action={<Button size="small" onClick={loadGraphs}>重试</Button>} /> : null}

      <Spin spinning={loading}>
        <div className="graph-directory-create">
          <div className="graph-directory-create-icon" aria-hidden="true"><PlusOutlined /></div>
          <div className="graph-directory-create-copy">
            <h3>新建图谱</h3>
            <p>上传 TXT / Markdown，后台会按结构化文本解析并生成你的专属图谱。</p>
          </div>
          <Button icon={<PlusOutlined />} onClick={() => setUploadOpen(true)}>开始创建</Button>
        </div>

        <div className="graph-directory-section">
          <div className="graph-directory-section-title">
            <span>系统图谱</span>
            <Text type="secondary">系统提供，普通用户不可删除</Text>
          </div>
          <div className="graph-directory-grid">
            {builtIn.length ? builtIn.map((graph) => (
              <GraphCard key={graph.graph_id} graph={graph} selected={selectedGraphId === graph.graph_id} onSelect={onSelect} onOpen={onOpen} />
            )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无系统图谱" />}
          </div>
        </div>

        <div className="graph-directory-section">
          <div className="graph-directory-section-title">
            <span>我的图谱</span>
            <Text type="secondary">创建后会出现在这里</Text>
          </div>
          <div className="graph-directory-grid">
            {mine.length ? mine.map((graph) => (
              <GraphCard key={graph.graph_id} graph={graph} selected={selectedGraphId === graph.graph_id} onSelect={onSelect} onOpen={onOpen} />
            )) : (
              <div className="graph-directory-empty">
                <span>还没有自己的图谱</span>
                <small>先使用内置图谱熟悉工作区，也可以立即上传 TXT / Markdown 创建自己的图谱。</small>
              </div>
            )}
          </div>
        </div>
      </Spin>

      <Modal
        open={uploadOpen}
        title="上传文本创建图谱"
        okText="开始构建"
        cancelText="取消"
        confirmLoading={uploading}
        onOk={handleUpload}
        onCancel={() => {
          if (!uploading) {
            setUploadOpen(false);
            form.resetFields();
            setFileList([]);
          }
        }}
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={{ language_mode: "dual" }}>
          <Form.Item label="图谱名称" name="name" rules={[{ required: true, message: "请输入图谱名称" }]}>
            <Input placeholder="例如：我的威胁情报图谱" maxLength={160} />
          </Form.Item>
          <Form.Item label="图谱简介" name="description">
            <Input.TextArea placeholder="简要说明图谱内容和用途" rows={3} maxLength={2000} />
          </Form.Item>
          <Form.Item label="语言层" name="language_mode">
            <Select options={[
              { value: "dual", label: "中英双层" },
              { value: "cn", label: "中文" },
              { value: "en", label: "英文" },
            ]} />
          </Form.Item>
          <Form.Item label="文本文件" required>
            <Upload
              accept=".txt,.md,.markdown"
              maxCount={1}
              fileList={fileList}
              beforeUpload={(file) => {
                setFileList([file]);
                return false;
              }}
              onRemove={() => setFileList([])}
            >
              <Button icon={<FileTextOutlined />}>选择 TXT / Markdown</Button>
            </Upload>
            <Typography.Paragraph type="secondary" className="upload-help">
              支持 UTF-8 编码，单文件不超过 10 MB。推荐格式：实体：名称、类型：类型、关系：源 - 关系 -&gt; 目标。
            </Typography.Paragraph>
          </Form.Item>
        </Form>
      </Modal>
    </section>
  );
}
