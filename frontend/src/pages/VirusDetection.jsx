import { useEffect, useRef, useState } from "react";
import { Button, Card, Input, Table, Tag, message, Space, Typography, Progress } from "antd";
import { BugOutlined, ScanOutlined, CheckCircleOutlined, WarningOutlined } from "@ant-design/icons";

import api, { errorMessage } from "../api";

const { Title, Text, Paragraph } = Typography;

export default function VirusDetection() {
  const [loading, setLoading] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("test_sample.exe");
  const timerRef = useRef(null);

  // 离开页面时清理进度条定时器，避免对已卸载组件 setState
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleScan = async () => {
    if (loading) return;
    setLoading(true);
    setScanResult(null);
    setProgress(0);

    // 模拟进度条
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          return 90;
        }
        return prev + 10;
      });
    }, 200);

    try {
      // 使用统一的 api 实例（相对路径 /api，由 Vite 代理转发到后端），
      // 不再硬编码 http://localhost:8000
      const response = await api.post("/api/virus-detection", {
        file_name: fileName.trim() || "unknown_file",
        file_type: (fileName.split(".").pop() || "exe").toLowerCase(),
      });

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setProgress(100);
      setScanResult(response.data);
      if (response.data.is_malicious) {
        message.error("检测到威胁！");
      } else {
        message.success("文件安全");
      }
    } catch (err) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      message.error(errorMessage(err, "检测失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: '检测引擎',
      dataIndex: 'engine',
      key: 'engine',
    },
    {
      title: '检测结果',
      dataIndex: 'result',
      key: 'result',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === '恶意' ? 'red' : 'green'}>
          {status}
        </Tag>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px', textAlign: 'center' }}>
        <Title level={2} style={{ fontWeight: 700, marginBottom: '8px' }}>病毒检测</Title>
        <Paragraph type="secondary">
          演示功能：后端当前为模拟实现（随机判定 + 固定引擎结果），并非真实的病毒扫描
        </Paragraph>
      </div>

      <Card 
        style={{ 
          borderRadius: '20px', 
          boxShadow: '0 10px 30px rgba(0,0,0,0.05)',
          border: 'none',
          padding: '20px'
        }}
      >
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ 
            width: '120px', 
            height: '120px', 
            borderRadius: '30px', 
            background: '#f5f5f7', 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            margin: '0 auto 24px auto',
            color: loading ? '#007aff' : '#333',
            transition: 'all 0.3s ease'
          }}>
            {loading ? <ScanOutlined style={{ fontSize: '48px' }} spin /> : <BugOutlined style={{ fontSize: '48px' }} />}
          </div>

          <Space direction="vertical" size={12} style={{ width: '100%', maxWidth: 360 }}>
            <Input
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="请输入要检测的文件名，例如 sample.exe"
              disabled={loading}
              allowClear
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              当前接口只接受文件名与类型，不会真正上传或读取文件内容
            </Text>
          </Space>

          <div style={{ marginTop: 20 }}>
            <Button 
              type="primary" 
              size="large" 
              icon={<ScanOutlined />} 
              onClick={handleScan}
              loading={loading}
              style={{ 
                borderRadius: '12px', 
                height: '50px', 
                padding: '0 40px',
                fontSize: '16px',
                fontWeight: 600,
                backgroundColor: '#007aff',
                boxShadow: '0 4px 14px rgba(0,122,255,0.3)'
              }}
            >
              开始病毒检测
            </Button>
          </div>

          {loading && (
            <div style={{ marginTop: '24px', maxWidth: '400px', margin: '24px auto 0' }}>
              <Progress percent={progress} status="active" strokeColor="#007aff" />
              <Text type="secondary">正在分析文件特征...</Text>
            </div>
          )}
        </div>

        {scanResult && (
          <div style={{ marginTop: '40px', animation: 'fadeIn 0.5s ease-out' }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              padding: '20px', 
              borderRadius: '16px', 
              background: scanResult.is_malicious ? '#fff1f0' : '#f6ffed',
              border: `1px solid ${scanResult.is_malicious ? '#ffa39e' : '#b7eb8f'}`,
              marginBottom: '32px'
            }}>
              {scanResult.is_malicious ? 
                <WarningOutlined style={{ fontSize: '24px', color: '#f5222d', marginRight: '16px' }} /> : 
                <CheckCircleOutlined style={{ fontSize: '24px', color: '#52c41a', marginRight: '16px' }} />
              }
              <div>
                <Title level={4} style={{ margin: 0, color: scanResult.is_malicious ? '#cf1322' : '#389e0d' }}>
                  {scanResult.is_malicious ? '发现恶意软件' : '未发现威胁'}
                </Title>
                <Text>{scanResult.summary}</Text>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <Tag color={scanResult.is_malicious ? 'red' : 'green'} style={{ fontSize: '14px', padding: '4px 12px', borderRadius: '8px' }}>
                  威胁等级: {scanResult.threat_level}
                </Tag>
              </div>
            </div>

            <Title level={4} style={{ marginBottom: '16px' }}>详细检测报告</Title>
            <Table 
              columns={columns} 
              dataSource={scanResult.scan_results} 
              pagination={false}
              rowKey="engine"
              style={{ 
                borderRadius: '12px', 
                overflow: 'hidden',
                border: '1px solid #f0f0f0'
              }}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
