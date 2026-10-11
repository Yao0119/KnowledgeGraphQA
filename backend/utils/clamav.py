"""ClamAV REST 适配层。

本项目只和内部的 ClamAV REST 服务通信，浏览器不会直接访问扫描容器。
"""

from __future__ import annotations

import hashlib
from typing import Any, Dict, List

import requests

from ..core.config import CLAMAV_REST_URL, CLAMAV_TIMEOUT


class ClamAVServiceError(RuntimeError):
    """扫描服务不可用或返回了无法识别的响应。"""


def _as_result_rows(payload: Any, infected_by_status: bool) -> List[dict]:
    items = payload if isinstance(payload, list) else [payload]
    rows = []
    for item in items:
        if not isinstance(item, dict):
            continue
        engine = item.get("engine") or item.get("Engine") or "ClamAV"
        result = (
            item.get("result")
            or item.get("Result")
            or item.get("message")
            or item.get("Message")
            or item.get("scan_result")
        )
        status_value = str(item.get("status") or item.get("Status") or "").lower()
        infected = infected_by_status or any(
            marker in status_value for marker in ("found", "infected", "malicious", "virus")
        )
        rows.append({
            "engine": str(engine),
            "result": str(result or ("检测到恶意特征" if infected else "未发现已知病毒特征")),
            "status": "恶意" if infected else "安全",
        })
    return rows


def scan_bytes(filename: str, content: bytes) -> Dict[str, Any]:
    """把文件交给 ClamAV REST，并统一成前端扫描报告格式。"""
    digest = hashlib.sha256(content).hexdigest()
    try:
        response = requests.post(
            CLAMAV_REST_URL,
            files={"file": (filename, content, "application/octet-stream")},
            timeout=CLAMAV_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise ClamAVServiceError(f"ClamAV 扫描服务不可用：{exc}") from exc

    if response.status_code == 413:
        raise ClamAVServiceError("扫描服务拒绝了文件：文件超过服务端大小限制")
    if response.status_code not in (200, 406):
        detail = response.text[:500].strip()
        raise ClamAVServiceError(
            f"ClamAV 扫描失败（HTTP {response.status_code}）{': ' + detail if detail else ''}"
        )

    try:
        payload = response.json()
    except ValueError:
        payload = {"message": response.text[:500]}

    infected = response.status_code == 406
    if isinstance(payload, dict):
        infected = infected or bool(
            payload.get("is_malicious")
            or payload.get("infected")
            or payload.get("malicious")
        )
    rows = _as_result_rows(payload, infected)
    if not rows:
        rows = [{
            "engine": "ClamAV",
            "result": "检测到恶意特征" if infected else "未发现已知病毒特征",
            "status": "恶意" if infected else "安全",
        }]

    return {
        "success": True,
        "is_malicious": infected,
        "threat_level": "High" if infected else "Low",
        "scan_results": rows,
        "summary": (
            f"文件 {filename} 命中 ClamAV 病毒特征，建议立即隔离。"
            if infected
            else f"文件 {filename} 扫描完成，未发现已知病毒特征。"
        ),
        "digest": digest,
        "size": len(content),
        "engine": "ClamAV",
    }
