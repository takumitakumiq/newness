"""
Custom middleware for WebSocket authentication.
"""
from channels.middleware import BaseMiddleware
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from urllib.parse import parse_qs


class JWTAuthMiddleware(BaseMiddleware):
    """
    JWT authentication middleware for WebSocket connections.
    
    Accepts token via:
    - Query string: ws://host/ws/chat/?token=<jwt_token>
    - Sec-WebSocket-Protocol header (for browsers that support it)
    """
    
    async def __call__(self, scope, receive, send):
        # Try to get token from query string
        query_string = scope.get("query_string", b"").decode()
        query_params = parse_qs(query_string)
        token = query_params.get("token", [None])[0]
        
        if token:
            scope["user"] = await self.get_user_from_token(token)
        else:
            scope["user"] = AnonymousUser()
        
        return await super().__call__(scope, receive, send)
    
    @database_sync_to_async
    def get_user_from_token(self, token):
        """Validate JWT token and return user."""
        from rest_framework_simplejwt.tokens import AccessToken
        from django.contrib.auth.models import User
        
        try:
            access_token = AccessToken(token)
            user_id = access_token["user_id"]
            return User.objects.get(id=user_id)
        except Exception:
            return AnonymousUser()
