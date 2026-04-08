"""Custom DRF exception handler with logging.

Catches all API exceptions, logs them with structured context, and returns
consistent error responses. Unhandled 500s are logged at ERROR level with
full tracebacks.
"""

import logging

from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status

logger = logging.getLogger("api")


def custom_exception_handler(exc, context):
    """Log exceptions and return a consistent error response."""
    response = exception_handler(exc, context)

    # Extract request metadata for log context.
    request = context.get("request")
    view = context.get("view")
    log_extra = {
        "endpoint": getattr(request, "path", "unknown"),
        "method": getattr(request, "method", "unknown"),
        "user": str(getattr(request, "user", "anonymous")),
    }
    if view:
        log_extra["view"] = view.__class__.__name__

    if response is not None:
        # Known DRF exceptions (400, 401, 403, 404, 405, 429, etc.)
        if response.status_code >= 500:
            logger.error(
                "Server error: %s",
                str(exc),
                extra=log_extra,
                exc_info=True,
            )
        elif response.status_code == 429:
            logger.warning(
                "Rate limit exceeded",
                extra=log_extra,
            )
        elif response.status_code >= 400:
            logger.info(
                "Client error %d: %s",
                response.status_code,
                str(exc),
                extra=log_extra,
            )
        return response

    # Unhandled exception — this is a 500.
    logger.error(
        "Unhandled exception: %s",
        str(exc),
        extra=log_extra,
        exc_info=True,
    )
    return Response(
        {"error": "An internal server error occurred. Please try again later."},
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )
