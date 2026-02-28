from django.test import TestCase


class HealthEndpointTests(TestCase):
    def test_health_endpoint_returns_ok(self):
        response = self.client.get("/api/health/", follow=True)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json().get("status"), "ok")
