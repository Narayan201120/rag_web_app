from django.test import TestCase
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode
from django.utils.encoding import force_bytes
from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from unittest.mock import patch
from types import SimpleNamespace
import os
import shutil

from api import views as api_views
from api.models import APIUsageLog, Conversation, ChatMessage, Task, Collection, Document


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

    def test_documents_list_prefers_markdown_over_text_for_same_stem(self):
        user_b_dir = os.path.join(api_views.DOC_DIR, str(self.user_b.id))
        with open(os.path.join(user_b_dir, "topic.txt"), "w", encoding="utf-8") as f:
            f.write("plain text")
        with open(os.path.join(user_b_dir, "topic.md"), "w", encoding="utf-8") as f:
            f.write("# markdown")

        self.api_client.force_authenticate(user=self.user_b)
        response = self.api_client.get("/api/documents/")

        self.assertEqual(response.status_code, 200)
        names = {item["name"] for item in response.json()["documents"]}
        self.assertIn("topic.md", names)
        self.assertNotIn("topic.txt", names)


class EndpointSmokeTests(TestCase):
    def setUp(self):
        self.api_client = APIClient()
        self.user = User.objects.create_user(username="smoke_user", password="pass12345")
        self.staff_user = User.objects.create_user(
            username="staff_user",
            password="pass12345",
            is_staff=True,
        )

        self.conversation = Conversation.objects.create(
            user=self.user,
            title="Smoke Test Conversation",
        )
        self.chat = ChatMessage.objects.create(
            user=self.user,
            conversation=self.conversation,
            question="What is RAG?",
            answer="Retrieval augmented generation.",
            sources=["rag_intro.txt"],
            chunks=["RAG combines retrieval with generation."],
        )

        self.original_docs = list(api_views.docs)
        self.original_chunk_sources = list(api_views.chunk_sources)
        self.original_index = api_views.index

    def tearDown(self):
        api_views.docs = self.original_docs
        api_views.chunk_sources = self.original_chunk_sources
        api_views.index = self.original_index

    def test_chat_history_returns_conversations(self):
        self.api_client.force_authenticate(user=self.user)
        response = self.api_client.get("/api/chat/history/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json().get("count"), 1)

    def test_chat_export_json_returns_chat_payload(self):
        self.api_client.force_authenticate(user=self.user)
        response = self.api_client.get(f"/api/chat/{self.chat.id}/export/")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body.get("id"), self.chat.id)
        self.assertEqual(body.get("question"), self.chat.question)

    def test_chat_export_markdown_returns_attachment(self):
        self.api_client.force_authenticate(user=self.user)
        response = self.api_client.get(f"/api/chat/{self.chat.id}/export/?export_format=markdown")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response["Content-Type"].startswith("text/markdown"))
        self.assertIn(f'chat_{self.chat.id}.md', response["Content-Disposition"])

    def test_chat_feedback_and_citations_endpoints(self):
        self.api_client.force_authenticate(user=self.user)

        feedback_response = self.api_client.post(
            f"/api/chat/{self.chat.id}/feedback/",
            {"rating": "up", "comment": "Helpful answer"},
            format="json",
        )
        citations_response = self.api_client.get(f"/api/chat/{self.chat.id}/citations/")

        self.assertEqual(feedback_response.status_code, 201)
        self.assertEqual(citations_response.status_code, 200)
        self.assertEqual(citations_response.json().get("total_citations"), 1)

    def test_admin_usage_requires_staff(self):
        self.api_client.force_authenticate(user=self.user)
        response = self.api_client.get("/api/admin/usage/")

        self.assertEqual(response.status_code, 403)

    def test_admin_usage_returns_stats_for_staff(self):
        APIUsageLog.objects.create(
            user=self.user,
            endpoint="/api/chat/",
            method="POST",
            status_code=200,
        )
        self.api_client.force_authenticate(user=self.staff_user)
        response = self.api_client.get("/api/admin/usage/")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("total_calls", body)
        self.assertIn("top_endpoints", body)

    @patch("api.views.ensure_documents_loaded")
    def test_admin_vectors_requires_staff(self, _mock_loaded):
        self.api_client.force_authenticate(user=self.user)
        response = self.api_client.get("/api/admin/vectors/")

        self.assertEqual(response.status_code, 403)

    @patch("api.views.ensure_documents_loaded")
    def test_admin_vectors_returns_stats_for_staff(self, _mock_loaded):
        api_views.docs = [
            "Chunk one for smoke testing",
            "Chunk two for smoke testing",
        ]
        api_views.chunk_sources = [
            "doc_a.txt",
            "doc_b.txt",
        ]
        api_views.index = SimpleNamespace(ntotal=2, d=384)

        self.api_client.force_authenticate(user=self.staff_user)
        response = self.api_client.get("/api/admin/vectors/")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body.get("total_vectors"), 2)
        self.assertEqual(body.get("total_documents"), 2)


class AuthAndTaskEndpointSmokeTests(TestCase):
    def setUp(self):
        self.api_client = APIClient()
        self.user = User.objects.create_user(
            username="auth_user",
            email="auth_user@example.com",
            password="pass12345",
        )
        self.other_user = User.objects.create_user(
            username="auth_other_user",
            email="auth_other_user@example.com",
            password="pass12345",
        )

    def test_signup_and_signin_success(self):
        signup_response = self.api_client.post(
            "/api/sign-up/",
            {
                "username": "new_user",
                "email": "new_user@example.com",
                "password": "strongpass123",
            },
            format="json",
        )
        signin_response = self.api_client.post(
            "/api/sign-in/",
            {"username": "new_user", "password": "strongpass123"},
            format="json",
        )

        self.assertEqual(signup_response.status_code, 201)
        self.assertIn("tokens", signup_response.json())
        self.assertEqual(signin_response.status_code, 200)
        self.assertIn("tokens", signin_response.json())

    def test_signup_rejects_duplicate_email(self):
        response = self.api_client.post(
            "/api/sign-up/",
            {
                "username": "another_user",
                "email": "auth_user@example.com",
                "password": "strongpass123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_account_endpoint_returns_authenticated_user(self):
        self.api_client.force_authenticate(user=self.user)
        response = self.api_client.get("/api/account/")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body.get("username"), self.user.username)
        self.assertEqual(body.get("email"), self.user.email)

    def test_forgot_password_returns_generic_success_message(self):
        existing_response = self.api_client.post(
            "/api/forgot-password/",
            {"email": self.user.email},
            format="json",
        )
        missing_response = self.api_client.post(
            "/api/forgot-password/",
            {"email": "missing@example.com"},
            format="json",
        )

        self.assertEqual(existing_response.status_code, 200)
        self.assertEqual(missing_response.status_code, 200)

    def test_reset_password_accepts_valid_token(self):
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = default_token_generator.make_token(self.user)

        response = self.api_client.post(
            "/api/reset-password/",
            {
                "uid": uid,
                "token": token,
                "new_password": "newpass12345",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        auth_user = authenticate(username=self.user.username, password="newpass12345")
        self.assertIsNotNone(auth_user)

    @patch("api.views.ensure_documents_loaded")
    @patch("api.views.search")
    def test_search_returns_results(self, mock_search, _mock_loaded):
        mock_search.return_value = (["retrieved chunk"], [0])
        api_views.chunk_sources = ["doc_a.txt"]

        self.api_client.force_authenticate(user=self.user)
        response = self.api_client.post(
            "/api/search/",
            {"query": "what is rag", "top_k": 1},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json().get("count"), 1)

    @patch("api.views.ensure_documents_loaded")
    def test_search_rejects_invalid_top_k(self, _mock_loaded):
        self.api_client.force_authenticate(user=self.user)
        response = self.api_client.post(
            "/api/search/",
            {"query": "what is rag", "top_k": "bad"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_settings_api_key_get_returns_provider_metadata(self):
        self.api_client.force_authenticate(user=self.user)
        response = self.api_client.get("/api/settings/api-key/")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("provider", body)
        self.assertIn("model", body)
        self.assertIn("supported_providers", body)
        self.assertIn("provider_models", body)
        self.assertIn("api_key", body)

    def test_settings_api_key_post_validates_provider_model_and_key(self):
        self.api_client.force_authenticate(user=self.user)

        invalid_provider_response = self.api_client.post(
            "/api/settings/api-key/",
            {"provider": "invalid", "model": "gpt-5-mini", "api_key": "abc123"},
            format="json",
        )
        invalid_model_response = self.api_client.post(
            "/api/settings/api-key/",
            {"provider": "openai", "model": "gemini-2.5-flash", "api_key": "abc123"},
            format="json",
        )
        missing_key_response = self.api_client.post(
            "/api/settings/api-key/",
            {"provider": "google-gemini", "model": "gemini-2.5-flash", "api_key": ""},
            format="json",
        )
        valid_response = self.api_client.post(
            "/api/settings/api-key/",
            {"provider": "openai", "model": "gpt-5-mini", "api_key": "sk-test-key"},
            format="json",
        )

        self.assertEqual(invalid_provider_response.status_code, 400)
        self.assertEqual(invalid_model_response.status_code, 400)
        self.assertEqual(missing_key_response.status_code, 400)
        self.assertEqual(valid_response.status_code, 200)

        get_response = self.api_client.get("/api/settings/api-key/")
        self.assertEqual(get_response.status_code, 200)
        self.assertEqual(get_response.json().get("provider"), "openai")
        self.assertEqual(get_response.json().get("model"), "gpt-5-mini")

    @patch("api.views.test_provider_connection")
    def test_settings_api_key_test_connection_success(self, mock_test_provider_connection):
        mock_test_provider_connection.return_value = "Connectivity confirmed."
        self.api_client.force_authenticate(user=self.user)

        response = self.api_client.post(
            "/api/settings/api-key/test/",
            {
                "provider": "openai",
                "model": "gpt-5-mini",
                "api_key": "sk-test-key",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body.get("message"), "Connection successful.")
        self.assertIn("reply_excerpt", body)

    def test_settings_api_key_test_connection_validates_model(self):
        self.api_client.force_authenticate(user=self.user)
        response = self.api_client.post(
            "/api/settings/api-key/test/",
            {
                "provider": "openai",
                "model": "gemini-2.5-flash",
                "api_key": "sk-test-key",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_task_status_and_cancel_success(self):
        task = Task.objects.create(
            user=self.user,
            task_type="ingest",
            status="pending",
            progress=5,
            message="Queued ingestion task.",
        )
        self.api_client.force_authenticate(user=self.user)

        status_response = self.api_client.get(f"/api/tasks/{task.id}/")
        cancel_response = self.api_client.post(f"/api/tasks/{task.id}/cancel/")

        self.assertEqual(status_response.status_code, 200)
        self.assertEqual(cancel_response.status_code, 200)
        self.assertIn("task_id", status_response.json())
        self.assertIn("status", status_response.json())
        self.assertIn("progress", status_response.json())

        task.refresh_from_db()
        self.assertEqual(task.status, "cancelled")

    def test_task_cancel_allows_processing_status(self):
        task = Task.objects.create(
            user=self.user,
            task_type="ingest",
            status="processing",
            progress=50,
            message="Processing",
        )
        self.api_client.force_authenticate(user=self.user)

        response = self.api_client.post(f"/api/tasks/{task.id}/cancel/")

        self.assertEqual(response.status_code, 200)
        task.refresh_from_db()
        self.assertEqual(task.status, "cancelled")

    def test_task_cancel_rejects_completed_task(self):
        task = Task.objects.create(
            user=self.user,
            task_type="ingest",
            status="completed",
            progress=100,
            message="Done",
        )
        self.api_client.force_authenticate(user=self.user)
        response = self.api_client.post(f"/api/tasks/{task.id}/cancel/")

        self.assertEqual(response.status_code, 400)

    def test_task_cancel_rejects_cancelled_task(self):
        task = Task.objects.create(
            user=self.user,
            task_type="ingest",
            status="cancelled",
            progress=100,
            message="Cancelled",
        )
        self.api_client.force_authenticate(user=self.user)

        response = self.api_client.post(f"/api/tasks/{task.id}/cancel/")

        self.assertEqual(response.status_code, 400)

    def test_task_endpoints_are_user_scoped(self):
        task = Task.objects.create(
            user=self.user,
            task_type="ingest",
            status="pending",
            progress=5,
            message="Queued ingestion task.",
        )
        self.api_client.force_authenticate(user=self.other_user)

        status_response = self.api_client.get(f"/api/tasks/{task.id}/")
        cancel_response = self.api_client.post(f"/api/tasks/{task.id}/cancel/")

        self.assertEqual(status_response.status_code, 404)
        self.assertEqual(cancel_response.status_code, 404)


class IngestAndCollectionEndpointSmokeTests(TestCase):
    def setUp(self):
        self.api_client = APIClient()
        self.user = User.objects.create_user(
            username="ingest_user",
            email="ingest_user@example.com",
            password="pass12345",
        )
        self.api_client.force_authenticate(user=self.user)

        self.original_doc_dir = api_views.DOC_DIR
        self.temp_doc_dir = os.path.join(settings.BASE_DIR, "test_ingest_documents_tmp")
        shutil.rmtree(self.temp_doc_dir, ignore_errors=True)
        os.makedirs(self.temp_doc_dir, exist_ok=True)
        api_views.DOC_DIR = self.temp_doc_dir

    def tearDown(self):
        api_views.DOC_DIR = self.original_doc_dir
        shutil.rmtree(self.temp_doc_dir, ignore_errors=True)

    @patch("api.views.submit_task")
    def test_upload_creates_pending_task(self, mock_submit_task):
        uploaded = SimpleUploadedFile("sample.txt", b"hello from test")

        response = self.api_client.post("/api/upload/", {"document": uploaded}, format="multipart")

        self.assertEqual(response.status_code, 202)
        created_task = Task.objects.get(user=self.user, task_type="upload")
        self.assertEqual(created_task.status, "pending")
        user_file_path = os.path.join(api_views.DOC_DIR, str(self.user.id), "sample.txt")
        self.assertTrue(os.path.exists(user_file_path))
        mock_submit_task.assert_called_once()

    @patch("api.views.submit_task")
    def test_upload_accepts_alternate_file_key(self, mock_submit_task):
        uploaded = SimpleUploadedFile("alt.txt", b"hello from alt key")

        response = self.api_client.post("/api/upload/", {"file": uploaded}, format="multipart")

        self.assertEqual(response.status_code, 202)
        created_task = Task.objects.get(user=self.user, task_type="upload")
        self.assertEqual(created_task.status, "pending")
        mock_submit_task.assert_called_once()

    def test_upload_rejects_missing_file(self):
        response = self.api_client.post("/api/upload/", {}, format="multipart")

        self.assertEqual(response.status_code, 400)

    def test_upload_rejects_unsupported_file_format(self):
        uploaded = SimpleUploadedFile("sample.exe", b"binary")

        response = self.api_client.post("/api/upload/", {"document": uploaded}, format="multipart")

        self.assertEqual(response.status_code, 400)

    def test_upload_url_requires_url(self):
        response = self.api_client.post("/api/upload-url/", {}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_upload_url_rejects_malformed_url(self):
        response = self.api_client.post(
            "/api/upload-url/",
            {"url": "not-a-url"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    @patch("api.views._is_safe_user_url")
    def test_upload_url_rejects_unsafe_url(self, mock_is_safe):
        mock_is_safe.return_value = False

        response = self.api_client.post(
            "/api/upload-url/",
            {"url": "http://localhost/internal"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    @patch("api.views.submit_task")
    @patch("api.views._is_safe_user_url")
    def test_upload_url_creates_pending_task_for_safe_url(self, mock_is_safe, mock_submit_task):
        mock_is_safe.return_value = True

        response = self.api_client.post(
            "/api/upload-url/",
            {"url": "https://example.com/doc.txt"},
            format="json",
        )

        self.assertEqual(response.status_code, 202)
        created_task = Task.objects.get(user=self.user, task_type="url_ingest")
        self.assertEqual(created_task.status, "pending")
        mock_submit_task.assert_called_once()

    @patch("api.views.submit_task")
    def test_ingest_creates_pending_task(self, mock_submit_task):
        response = self.api_client.post("/api/ingest/", {}, format="json")

        self.assertEqual(response.status_code, 202)
        created_task = Task.objects.get(user=self.user, task_type="ingest")
        self.assertEqual(created_task.status, "pending")
        mock_submit_task.assert_called_once()

    def test_collections_create_and_list(self):
        create_response = self.api_client.post(
            "/api/collections/",
            {"name": "Research", "description": "My docs"},
            format="json",
        )
        list_response = self.api_client.get("/api/collections/")

        self.assertEqual(create_response.status_code, 201)
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.json().get("count"), 1)

    def test_collections_reject_duplicate_name(self):
        Collection.objects.create(user=self.user, name="Research", description="first")

        response = self.api_client.post(
            "/api/collections/",
            {"name": "Research", "description": "duplicate"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_move_document_assigns_collection(self):
        collection = Collection.objects.create(user=self.user, name="Research", description="docs")

        response = self.api_client.put(
            "/api/documents/sample.txt/move/",
            {"collection_id": collection.id},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        doc = Document.objects.get(user=self.user, filename="sample.txt")
        self.assertEqual(doc.collection_id, collection.id)

    def test_move_document_rejects_invalid_collection(self):
        response = self.api_client.put(
            "/api/documents/sample.txt/move/",
            {"collection_id": 999999},
            format="json",
        )

        self.assertEqual(response.status_code, 404)


class URLParsingHelperTests(TestCase):
    def test_fix_common_mojibake_repairs_utf8_text(self):
        expected = "p(C_{k}\u2223x_{1})"
        broken = expected.encode("utf-8").decode("latin-1")
        repaired = api_views._fix_common_mojibake(broken)
        self.assertEqual(repaired, expected)

    def test_fix_common_mojibake_replaces_common_word_level_artifacts(self):
        broken = "Uses tfâ€“idf and expectationâ€“maximization."
        repaired = api_views._fix_common_mojibake(broken)
        self.assertEqual(repaired, "Uses tf-idf and expectation-maximization.")

    def test_extract_readable_text_from_html_converts_math(self):
        html = """
        <html>
          <body>
            <p>Probabilistic model</p>
            <math alttext="{\\displaystyle p(C_{k}\\mid x_{1},\\ldots ,x_{n})}"></math>
            <p>End section.</p>
          </body>
        </html>
        """
        text = api_views._extract_readable_text_from_html(html)
        self.assertIn("Probabilistic model", text)
        self.assertIn("p(C_{k}\\mid x_{1},\\ldots ,x_{n})", text)
        self.assertIn("End section.", text)

    def test_clean_extracted_text_removes_displaystyle_artifacts(self):
        raw = "Intro line\n{\\displaystyle p(C_{k}\\mid x)}\nW\nq\nConclusion line"
        cleaned = api_views._clean_extracted_text(raw)

        self.assertIn("Intro line", cleaned)
        self.assertIn("Conclusion line", cleaned)
        self.assertIn("$p(C_{k}\\mid x)$", cleaned)
        self.assertNotIn("\nW\n", f"\n{cleaned}\n")

    def test_clean_extracted_text_removes_mojibake_symbol_lines(self):
        raw = "Heading\nâˆ£\nâ€¦\nBody line with Ã— symbol"
        cleaned = api_views._clean_extracted_text(raw)

        self.assertIn("Heading", cleaned)
        self.assertIn("Body line with × symbol", cleaned)
        self.assertNotIn("âˆ£", cleaned)
        self.assertNotIn("â€¦", cleaned)

    def test_extract_markdown_from_html_keeps_wiki_math_alt_as_latex(self):
        html = """
        <div id="mw-content-text">
          <p>The function <span class="mwe-math-element"><img alt="{\\displaystyle f_{c}(z)=z^{2}+c}"></span> is iterated.</p>
        </div>
        """
        md = api_views._extract_markdown_from_html(html)
        self.assertIn("$f_{c}(z)=z^{2}+c$", md)
