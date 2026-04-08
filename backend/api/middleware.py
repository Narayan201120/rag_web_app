"""API middleware for usage tracking and request logging."""

import logging
import time
import uuid

from api.models import APIUsageLog

logger = logging.getLogger("api")


class UsageTrackingMiddleware:
    """Tracks API usage in the database and logs request metrics."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not request.path.startswith("/api/"):
            return self.get_response(request)

        # Assign a unique request ID for tracing.
        request_id = str(uuid.uuid4())[:8]
        request.META["HTTP_X_REQUEST_ID"] = request_id

        start_time = time.monotonic()
        response = self.get_response(request)
        duration_ms = round((time.monotonic() - start_time) * 1000, 1)

        # Add request ID to response headers.
        response["X-Request-ID"] = request_id

        user_str = "anonymous"
        if hasattr(request, "user") and request.user.is_authenticated:
            user_str = request.user.username
            APIUsageLog.objects.create(
                user=request.user,
                endpoint=request.path,
                method=request.method,
                status_code=response.status_code,
            )

        # Structured request log.
        log_level = logging.WARNING if response.status_code >= 400 else logging.INFO
        logger.log(
            log_level,
            "%s %s %d %sms",
            request.method,
            request.path,
            response.status_code,
            duration_ms,
            extra={
                "user": user_str,
                "endpoint": request.path,
                "method": request.method,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
                "ip": self._get_client_ip(request),
                "request_id": request_id,
            },
        )

        return response

    @staticmethod
    def _get_client_ip(request):
        """Extract client IP, respecting X-Forwarded-For behind proxies."""
        xff = request.META.get("HTTP_X_FORWARDED_FOR")
        if xff:
            return xff.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR", "unknown")
