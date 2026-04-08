"""Custom throttle classes for API rate limiting."""

from rest_framework.throttling import UserRateThrottle


class ChatRateThrottle(UserRateThrottle):
    """Stricter rate limit for the chat/ask endpoint.

    Uses the 'chat' rate from DEFAULT_THROTTLE_RATES (10/minute).
    """
    scope = "chat"
