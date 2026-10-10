/**
 * LLM 系统设置弹窗
 *
 * 供主页（Dashboard）的齿轮按钮与"系统设置"菜单项打开，用于在运行时配置
 * 调用大模型所需的 API Key（默认后端是 DeepSeek）。
 *
 * 设计要点：
 *   1. **密钥不回传明文** —— 后端只返回掩码（sk-a******ijkl），
 *      这里用 Input.Password 承载"重新输入"，留空即表示不修改。
 *   2. **保存即生效** —— 后端会同步更新内存配置、os.environ 与 .env 文件，
 *      并重建 LLM 客户端单例，无需重启 uvicorn。
 *   3. **可测试** —— "测试连接"走后端 GET /models 探针，不消耗 token，
 *      能直接区分"Key 无效(401)"与"网络不通"。
 */

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  AutoComplete,
  Button,
  Divider,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from "antd";
import {
  ApiOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  SaveOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";

import api, { errorMessage, isAdmin } from "../api";

const { Text, Paragraph, Link } = Typography;

/** DeepSeek 官方可选模型（也可自行填写，表单是自由输入 + 建议项） */
const MODEL_SUGGESTIONS = [
  { value: "deepseek-flash", label: "deepseek-flash（DeepSeek-V4.1-Flash，默认）" },
  { value: "deepseek-v4-pro", label: "deepseek-v4-pro（更强推理）" },
  { value: "deepseek-v4-flash", label: "deepseek-v4-flash（旧名，已下线）" },
];

export default function LLMSettingsModal({ open, onClose, onSaved }) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settings, setSettings] = useState(null);
  const [forbidden, setForbidden] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const admin = isAdmin();

  // -------------------------
  // 打开时读取当前设置
  // -------------------------
  const loadSettings = useCallback(async () => {
    setLoading(true);
    setForbidden(false);
    setTestResult(null);
    try {
      const res = await api.get("/api/settings/llm");
      const data = res.data?.data ?? null;
      setSettings(data);
      form.setFieldsValue({
        provider: data?.provider ?? "deepseek",
        model: data?.model ?? "deepseek-flash",
        base_url: data?.base_url ?? "",
        api_key: "", // 永远不回填明文
      });
    } catch (err) {
      if (err?.response?.status === 403) {
        setForbidden(true);
      } else {
        message.error(errorMessage(err, "读取设置失败"));
      }
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => {
    if (open) loadSettings();
  }, [open, loadSettings]);

  // -------------------------
  // 保存
  // -------------------------
  const handleSave = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    const payload = {};
    // 留空 = 不修改；只有真的填了新 Key 才提交，避免把已有 Key 清掉
    if (values.api_key && values.api_key.trim()) payload.api_key = values.api_key.trim();
    if (values.provider) payload.provider = values.provider;
    if (values.model && values.model.trim()) payload.model = values.model.trim();
    if (values.base_url && values.base_url.trim()) payload.base_url = values.base_url.trim();

    if (!Object.keys(payload).length) {
      message.info("没有需要保存的修改");
      return;
    }

    setSaving(true);
    try {
      const res = await api.put("/api/settings/llm", payload);
      const updated = res.data?.updated ?? [];
      setSettings(res.data?.data ?? null);
      form.setFieldValue("api_key", "");
      message.success(
        `已保存并立即生效（${updated.join("、")}），同时写入 .env，重启后依然有效`
      );
      onSaved?.(res.data?.data ?? null);
    } catch (err) {
      message.error(errorMessage(err, "保存失败"));
    } finally {
      setSaving(false);
    }
  };

  // -------------------------
  // 清除 API Key
  // -------------------------
  const handleClearKey = () => {
    Modal.confirm({
      title: "清除 API Key",
      content: "清除后问答 / 推理 / 预测等依赖大模型的功能将不可用，确定继续？",
      okText: "清除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      async onOk() {
        try {
          const res = await api.put("/api/settings/llm", { api_key: "" });
          setSettings(res.data?.data ?? null);
          form.setFieldValue("api_key", "");
          setTestResult(null);
          message.success("已清除 API Key");
          onSaved?.(res.data?.data ?? null);
        } catch (err) {
          message.error(errorMessage(err, "清除失败"));
        }
      },
    });
  };

  // -------------------------
  // 测试连接
  // -------------------------
  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post("/api/settings/llm/test");
      setTestResult(res.data?.data ?? null);
    } catch (err) {
      setTestResult({
        ok: false,
        message: errorMessage(err, "测试请求失败"),
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <ApiOutlined />
          <span>系统设置 · 大模型 API</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={640}
      footer={[
        <Button key="test" icon={<ThunderboltOutlined />} onClick={handleTest} loading={testing} disabled={forbidden}>
          测试连接
        </Button>,
        <Button key="close" onClick={onClose}>
          关闭
        </Button>,
        <Button
          key="save"
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleSave}
          loading={saving}
          disabled={forbidden}
        >
          保存并生效
        </Button>,
      ]}
    >
      {forbidden ? (
        <Alert
          type="warning"
          showIcon
          message="需要管理员权限"
          description="API Key 属于系统级配置，仅管理员可以查看和修改。请使用 admin 账户登录后重试。"
        />
      ) : (
        <>
          {!admin ? (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              message="当前登录账户不是管理员，保存时可能被拒绝"
            />
          ) : null}

          {settings ? (
            <Alert
              type={settings.available ? "success" : "warning"}
              showIcon
              style={{ marginBottom: 12 }}
              message={
                settings.available
                  ? `当前后端可用（${settings.provider} / ${settings.model}）`
                  : `当前不可用：${settings.reason ?? "原因未知"}`
              }
              description={
                <Space direction="vertical" size={2}>
                  <Text type="secondary">
                    API Key：{settings.api_key_set ? settings.api_key_masked : "未配置"}
                    {settings.api_key_from_env ? "（来自环境变量）" : ""}
                    {settings.env_file_has_key ? "（.env 中已保存）" : ""}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    配置文件：{settings.env_file}
                    {settings.env_file_exists ? "" : "（尚不存在，保存时会创建）"}
                  </Text>
                </Space>
              }
            />
          ) : null}

          <Form form={form} layout="vertical" disabled={loading}>
            <Form.Item
              name="api_key"
              label="DeepSeek API Key"
              extra="留空表示不修改现有 Key。申请地址：platform.deepseek.com/api_keys"
            >
              <Input.Password
                placeholder={settings?.api_key_set ? `已配置（${settings.api_key_masked}），留空则不修改` : "sk-..."}
                autoComplete="new-password"
                prefix={<ApiOutlined style={{ color: "var(--c-fg-faint)" }} />}
              />
            </Form.Item>

            <Space size="middle" style={{ width: "100%" }} align="start">
              <Form.Item name="provider" label="后端" style={{ width: 200 }}>
                <Select
                  options={[
                    { value: "deepseek", label: "DeepSeek 云端（默认）" },
                    { value: "ollama", label: "本地 Ollama" },
                  ]}
                />
              </Form.Item>
              <Form.Item
                name="model"
                label="模型"
                style={{ width: 340 }}
                extra="可直接输入自定义模型名"
              >
                {/* 用 AutoComplete 而不是 Select：需要在给出官方建议的同时允许自由输入 */}
                <AutoComplete
                  options={MODEL_SUGGESTIONS}
                  filterOption={(input, option) =>
                    String(option?.value ?? "")
                      .toLowerCase()
                      .includes(String(input).toLowerCase())
                  }
                />
              </Form.Item>
            </Space>

            <Divider style={{ margin: "4px 0 12px" }} orientation="left" plain>
              高级
            </Divider>

            <Form.Item
              name="base_url"
              label="API 基址"
              extra="一般无需修改；使用代理或兼容网关时才改"
            >
              <Input placeholder="https://api.deepseek.com" />
            </Form.Item>
          </Form>

          {testResult ? (
            <Alert
              type={testResult.ok ? "success" : "error"}
              showIcon
              icon={testResult.ok ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
              message={testResult.ok ? "连接正常" : "连接失败"}
              description={
                <Space direction="vertical" size={2}>
                  <Text>{testResult.message}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    provider={testResult.provider} model={testResult.model}
                  </Text>
                </Space>
              }
            />
          ) : null}

          {settings?.api_key_set ? (
            <div style={{ marginTop: 12, textAlign: "right" }}>
              <Link type="danger" onClick={handleClearKey}>
                <DeleteOutlined /> 清除已保存的 API Key
              </Link>
            </div>
          ) : null}

          <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
            保存后会同时更新运行时配置与仓库根目录的 <Text code>.env</Text>
            （该文件已被 .gitignore 忽略，不会被提交），因此重启后端依然有效。
          </Paragraph>
        </>
      )}
    </Modal>
  );
}
