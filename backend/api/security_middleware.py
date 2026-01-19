"""
Security headers middleware.
"""
from django.conf import settings


class SecurityHeadersMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        admin_ips = getattr(settings, "ADMIN_ALLOWED_IPS", [])
        if admin_ips and (request.path.startswith("/admin") or request.path.startswith("/api/admin")):
            client_ip = request.META.get("REMOTE_ADDR", "")
            xff = request.META.get("HTTP_X_FORWARDED_FOR")
            if xff:
                client_ip = xff.split(",")[0].strip()
            if client_ip not in admin_ips:
                from django.http import HttpResponseForbidden
                return HttpResponseForbidden("Forbidden")
        response = self.get_response(request)

        response.setdefault("X-Content-Type-Options", "nosniff")
        response.setdefault("X-Frame-Options", "DENY")
        response.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

        if not settings.DEBUG:
            response.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")

        csp_parts = [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "connect-src 'self' ws: wss:",
            "frame-ancestors 'none'",
        ]
        response.setdefault("Content-Security-Policy", "; ".join(csp_parts))
        return response
