import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.functions import routes


class PublicVirusUploadTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(routes.router)
        self.client = TestClient(app)

    @patch("backend.functions.routes.scan_bytes")
    def test_upload_scans_without_login(self, scan_bytes):
        scan_bytes.return_value = {
            "success": True,
            "is_malicious": False,
            "threat_level": "Low",
            "scan_results": [],
            "summary": "未发现已知病毒特征。",
        }

        response = self.client.post(
            "/api/virus-detection/upload",
            files={"file": ("sample.txt", b"safe sample", "text/plain")},
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["success"])
        scan_bytes.assert_called_once_with("sample.txt", b"safe sample")


if __name__ == "__main__":
    unittest.main()
