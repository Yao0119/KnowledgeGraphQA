import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Divider,
  Modal,
  Radio,
  Select,
  Space,
  Switch,
  Typography,
} from "antd";
import {
  BgColorsOutlined,
  BulbOutlined,
  FontSizeOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";

import api from "../api";
import { getPreferences, savePreferences } from "../preferences";

const { Text } = Typography;

export default function UserSettingsModal({ open, onClose, userId, isAdmin, onOpenLLM }) {
  const [preferences, setPreferences] = useState(() => getPreferences(userId));
  const [graphs, setGraphs] = useState([]);
  const [loadingGraphs, setLoadingGraphs] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPreferences(getPreferences(userId));
    setLoadingGraphs(true);
    api.get("/api/graphs")
      .then((res) => setGraphs(res.data?.data ?? []))
      .catch(() => setGraphs([]))
      .finally(() => setLoadingGraphs(false));
  }, [open, userId]);

  const update = (patch) => {
    const next = savePreferences(userId, patch);
    setPreferences(next);
    if (patch.defaultGraphId) {
      localStorage.setItem("active_graph_id", patch.defaultGraphId);
      window.dispatchEvent(new CustomEvent("kg-graph-changed", { detail: patch.defaultGraphId }));
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={
        <Space>
          <SettingOutlined />
          <span>系统设置</span>
        </Space>
      }
      width={620}
      footer={<Button onClick={onClose}>完成</Button>}
    >
      <Alert
        type="info"
        showIcon
        message="这些偏好只保存在当前浏览器"
        description="主题、字号和默认图谱会按登录用户隔离保存，换设备登录后不会自动同步。"
        style={{ marginBottom: 18 }}
      />

      <section>
        <div className="settings-section-heading">
          <BgColorsOutlined />
          <div>
            <Text strong>外观</Text>
            <div className="settings-section-hint">保持现有白灰黑风格，只调整使用舒适度。</div>
          </div>
        </div>

        <div className="settings-row">
          <div>
            <Text>主题模式</Text>
            <div className="settings-section-hint">跟随系统会根据操作系统自动选择。</div>
          </div>
          <Radio.Group
            value={preferences.theme}
            onChange={(event) => update({ theme: event.target.value })}
            optionType="button"
            buttonStyle="solid"
            options={[
              { label: "跟随系统", value: "system" },
              { label: "浅色", value: "light" },
              { label: "深色", value: "dark" },
            ]}
          />
        </div>

        <div className="settings-row">
          <div>
            <Text>字号</Text>
            <div className="settings-section-hint">影响页面正文和控件文字。</div>
          </div>
          <Radio.Group
            value={preferences.fontScale}
            onChange={(event) => update({ fontScale: event.target.value })}
            optionType="button"
            buttonStyle="solid"
            options={[
              { label: "小", value: "small" },
              { label: "标准", value: "standard" },
              { label: "大", value: "large" },
            ]}
          />
        </div>

        <div className="settings-row">
          <div>
            <Text>界面密度</Text>
            <div className="settings-section-hint">紧凑模式适合同时查看更多表格和节点。</div>
          </div>
          <Radio.Group
            value={preferences.density}
            onChange={(event) => update({ density: event.target.value })}
            optionType="button"
            buttonStyle="solid"
            options={[
              { label: "舒适", value: "comfortable" },
              { label: "紧凑", value: "compact" },
            ]}
          />
        </div>

        <div className="settings-row">
          <div>
            <Text>减少动画</Text>
            <div className="settings-section-hint">关闭过渡和扫描等非必要动效。</div>
          </div>
          <Switch
            checked={preferences.reduceMotion}
            onChange={(checked) => update({ reduceMotion: checked })}
            checkedChildren="开"
            unCheckedChildren="关"
          />
        </div>
      </section>

      <Divider />

      <section>
        <div className="settings-section-heading">
          <BulbOutlined />
          <div>
            <Text strong>工作区</Text>
            <div className="settings-section-hint">下次登录后默认打开选中的图谱。</div>
          </div>
        </div>
        <Select
          value={preferences.defaultGraphId}
          loading={loadingGraphs}
          style={{ width: "100%" }}
          placeholder="选择默认图谱"
          options={graphs.map((graph) => ({ value: graph.graph_id, label: graph.name }))}
          onChange={(value) => update({ defaultGraphId: value })}
          notFoundContent="暂无可访问图谱"
        />
      </section>

      {isAdmin && (
        <>
          <Divider />
          <section>
            <div className="settings-section-heading">
              <ThunderboltOutlined />
              <div>
                <Text strong>管理员设置</Text>
                <div className="settings-section-hint">大模型 API Key 属于系统级配置。</div>
              </div>
            </div>
            <Button onClick={() => { onClose(); onOpenLLM?.(); }}>
              打开大模型配置
            </Button>
          </section>
        </>
      )}
    </Modal>
  );
}
