"""不调用外部 LLM/Neo4j 的文本建图纯函数测试。"""

import unittest
from unittest.mock import patch

from backend.graph_builder import (
    _extract_json_payload,
    _normalize_extracted_graph,
    _split_text_for_extraction,
    extract_graph_with_llm,
)


class GraphBuilderExtractionTests(unittest.TestCase):
    def test_extract_json_from_markdown_code_block(self):
        payload = _extract_json_payload(
            "结果如下：\n```json\n"
            '{"entities":[{"name":"Windows","type":"Platform"}],"relations":[]}'
            "\n```"
        )
        self.assertEqual(payload["entities"][0]["name"], "Windows")

    def test_normalize_deduplicates_and_filters_orphan_relations(self):
        nodes, relationships = _normalize_extracted_graph(
            [
                {"name": "Windows", "type": "Platform"},
                {"name": " windows ", "type": "Entity"},
                {"name": "Example Trojan", "type": "Malware"},
            ],
            [
                {"source": "Example Trojan", "relation": "运行环境", "target": "Windows"},
                {"source": "Example Trojan", "relation": "运行环境", "target": "windows"},
                {"source": "Example Trojan", "relation": "影响", "target": "不存在的实体"},
            ],
        )

        self.assertEqual(len(nodes), 2)
        self.assertEqual(nodes[0]["node_type"], "Platform")
        self.assertEqual(len(relationships), 1)
        self.assertEqual(relationships[0]["target"], "Windows")

    def test_split_text_respects_chunk_limit(self):
        chunks = _split_text_for_extraction("第一段。\n\n第二段。\n\n第三段。", max_chars=5)
        self.assertTrue(chunks)
        self.assertTrue(all(len(chunk) <= 5 for chunk in chunks))

    def test_llm_extraction_uses_json_and_keeps_only_valid_relations(self):
        class FakeClient:
            last_error = None

            def is_available(self):
                return True

            def chat(self, **kwargs):
                return {
                    "message": {
                        "content": (
                            '{"entities":['
                            '{"name":"Example Trojan","type":"Malware"},'
                            '{"name":"Windows","type":"Platform"}],'
                            '"relations":['
                            '{"source":"Example Trojan","relation":"运行环境","target":"Windows"},'
                            '{"source":"Example Trojan","relation":"影响","target":"Unknown"}]}'
                        )
                    }
                }

        with patch("backend.graph_builder.get_llm_client", return_value=FakeClient()):
            nodes, relationships = extract_graph_with_llm("Example Trojan 运行在 Windows 上。")

        self.assertEqual(len(nodes), 2)
        self.assertEqual(len(relationships), 1)
        self.assertEqual(relationships[0]["relation"], "运行环境")


if __name__ == "__main__":
    unittest.main()
