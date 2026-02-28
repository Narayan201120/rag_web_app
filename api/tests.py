from django.test import TestCase
from django.contrib.auth.models import User
from django.conf import settings
from rest_framework.test import APIClient
import os
import shutil

from api import views as api_views


class HealthEndpointTests(TestCase):
    def test_health_endpoint_returns_ok(self):
        response = self.client.get("/api/health/", follow=True)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json().get("status"), "ok")


class DocumentIsolationTests(TestCase):
    def setUp(self):
        self.api_client = APIClient()
        self.original_doc_dir = api_views.DOC_DIR
        self.temp_doc_dir = os.path.join(settings.BASE_DIR, "test_documents_tmp")
        shutil.rmtree(self.temp_doc_dir, ignore_errors=True)
        os.makedirs(self.temp_doc_dir, exist_ok=True)
        api_views.DOC_DIR = self.temp_doc_dir

        self.user_a = User.objects.create_user(username="user_a", password="pass12345")
        self.user_b = User.objects.create_user(username="user_b", password="pass12345")

        user_a_dir = os.path.join(api_views.DOC_DIR, str(self.user_a.id))
        user_b_dir = os.path.join(api_views.DOC_DIR, str(self.user_b.id))
        os.makedirs(user_a_dir, exist_ok=True)
        os.makedirs(user_b_dir, exist_ok=True)

        with open(os.path.join(user_a_dir, "a_only.txt"), "w", encoding="utf-8") as f:
            f.write("doc for user a")
        with open(os.path.join(user_b_dir, "b_only.txt"), "w", encoding="utf-8") as f:
            f.write("doc for user b")

    def tearDown(self):
        api_views.DOC_DIR = self.original_doc_dir
        shutil.rmtree(self.temp_doc_dir, ignore_errors=True)

    def test_documents_list_is_user_scoped(self):
        self.api_client.force_authenticate(user=self.user_b)
        response = self.api_client.get("/api/documents/")

        self.assertEqual(response.status_code, 200)
        names = {item["name"] for item in response.json()["documents"]}
        self.assertIn("b_only.txt", names)
        self.assertNotIn("a_only.txt", names)
