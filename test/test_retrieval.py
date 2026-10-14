"""知识图谱检索的回归测试。"""

import unittest
from unittest.mock import patch

from backend.functions import retrieval


class RetrievalTest(unittest.TestCase):
    def test_malware_path_is_kept_as_one_token(self):
        terms = retrieval.extract_terms("RiskWare/MacOS.Apfell 有哪些典型变种？")

        self.assertIn("riskware/macos.apfell", terms)

    @patch("backend.functions.retrieval._run", return_value=[])
    def test_term_search_filters_nodes_before_expanding_relationships(self, mock_run):
        retrieval.fetch_triples_by_terms(["恶意软件"], limit=5)

        query = " ".join(mock_run.call_args.args[0].split())
        node_match = query.index("MATCH (n:Entity)")
        relationship_match = query.index("MATCH (n)-[r]-(m)")

        self.assertLess(node_match, relationship_match)
        self.assertIn("LIMIT $entity_limit", query)
        self.assertEqual(mock_run.call_args.kwargs["entity_limit"], 40)


if __name__ == "__main__":
    unittest.main()
