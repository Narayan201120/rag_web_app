from api.models import APIUsageLog

class UsageTrackingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith('/api/') and hasattr(request, 'user') and request.user.is_authenticated:
            APIUsageLog.objects.create(
                user = request.user,
                endpoint = request.path,
                method = request.method,
                status_code = response.status_code,
            )
        return response
