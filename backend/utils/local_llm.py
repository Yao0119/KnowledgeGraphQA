"""
本地LLM集成模块
支持通过Ollama调用本地模型（如Qwen、ChatGLM等）
"""

import requests
import json
from typing import Optional, List, Dict, Any
from ..core.config import OLLAMA_MODEL, OLLAMA_BASE_URL


class LocalLLMClient:
    """
    本地LLM客户端（Ollama）
    用于与Ollama服务交互，调用本地语言模型

    Attributes:
        provider: 固定为 "ollama"，供 utils.llm 工厂与健康检查识别
        base_url: Ollama服务的基础URL
        model_name: 使用的模型名称
        endpoint: API端点URL
    """

    provider = "ollama"

    def __init__(
        self,
        base_url: str = OLLAMA_BASE_URL,
        model_name: str = OLLAMA_MODEL
    ):
        """
        初始化本地LLM客户端
        
        Args:
            base_url: Ollama服务地址（默认：http://localhost:11434）
            model_name: 模型名称（默认：使用配置中的模型）
            
        支持的模型列表：
            - qwen:1.8b - Alibaba Qwen 1.8B (推荐)
            - qwen:7b - Alibaba Qwen 7B
            - chatglm:6b - ChatGLM 6B
            - llama2:7b - Meta Llama2 7B
        """
        self.base_url = base_url
        self.model_name = model_name
        self.endpoint = f"{base_url}/api/generate"
        self.chat_endpoint = f"{base_url}/api/chat"
        
    def is_available(self) -> bool:
        """
        检查Ollama服务是否可用
        
        Returns:
            bool: 服务可用返回True，否则返回False
        """
        try:
            response = requests.get(f"{self.base_url}/api/tags", timeout=2)
            return response.status_code == 200
        except Exception as e:
            print(f"[Ollama] 服务不可用: {e}")
            return False
    
    def get_available_models(self) -> List[str]:
        """
        获取可用的模型列表
        
        Returns:
            list: 可用模型名称列表
        """
        try:
            response = requests.get(f"{self.base_url}/api/tags", timeout=5)
            if response.status_code == 200:
                data = response.json()
                models = [
                    model.get("name", "unknown")
                    for model in data.get("models", [])
                ]
                return models
            return []
        except Exception as e:
            print(f"[Ollama] 获取模型列表失败: {e}")
            return []
    
    def generate(
        self,
        prompt: str,
        temperature: float = 0.3,
        top_p: float = 0.9,
        max_tokens: int = 1024,
        stream: bool = False
    ) -> str:
        """
        调用本地LLM生成文本
        
        Args:
            prompt: 输入提示文本
            temperature: 温度参数（0-1，越高越随意）
            top_p: 核采样参数
            max_tokens: 最大生成令牌数
            stream: 是否使用流式输出
            
        Returns:
            str: 生成的文本
        """
        if not self.is_available():
            return "本地LLM服务未启动，请先运行: ollama serve"
        
        try:
            payload = {
                "model": self.model_name,
                "prompt": prompt,
                "temperature": temperature,
                "top_p": top_p,
                "num_predict": max_tokens,
                "stream": stream,
            }
            
            response = requests.post(
                self.endpoint,
                json=payload,
                timeout=60
            )
            
            if response.status_code == 200:
                if stream:
                    text = ""
                    for line in response.iter_lines():
                        if line:
                            data = json.loads(line)
                            text += data.get("response", "")
                    return text
                else:
                    data = response.json()
                    return data.get("response", "")
            else:
                return f"API错误: {response.status_code}"
        except Exception as e:
            return f"生成失败: {str(e)}"
    
    def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.3,
        max_tokens: int = 1024
    ) -> Dict[str, Any]:
        """
        调用本地LLM进行多轮对话
        
        Args:
            messages: 对话消息列表，每条消息包含role和content
            temperature: 温度参数（0-1）
            max_tokens: 最大生成令牌数
            
        Returns:
            dict: 包含message字段的响应，message有content键
            
        Example:
            >>> messages = [
            ...     {"role": "user", "content": "你好"},
            ...     {"role": "assistant", "content": "你好！"}
            ... ]
            >>> response = client.chat(messages)
        """
        if not self.is_available():
            return {
                "message": {
                    "content": "本地LLM服务未启动，请先运行: ollama serve"
                }
            }
        
        try:
            payload = {
                "model": self.model_name,
                "messages": messages,
                "temperature": temperature,
                "num_predict": max_tokens,
                "stream": False,
            }
            
            response = requests.post(
                self.chat_endpoint,
                json=payload,
                timeout=60
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                return {
                    "message": {
                        "content": f"API错误: {response.status_code}"
                    }
                }
        except Exception as e:
            return {
                "message": {
                    "content": f"对话失败: {str(e)}"
                }
            }


# ========================================
# 客户端选择
# ========================================
# 这里**不再**提供 get_llm_client()：原先 local_llm.py 自带一套单例，
# 一旦引入第二个后端（DeepSeek）就会出现两个互相独立的"全局客户端"，
# 行为取决于谁先被 import。统一由 utils/llm.py 的工厂负责选择后端：
#
#     from ..utils.llm import get_llm_client
#
# 本模块只保留 Ollama 客户端实现本身。

# 语义化别名，便于阅读
OllamaClient = LocalLLMClient
