"""
WebSocket consumers for real-time chat.
"""
import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone


class ChatConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for staff chat.
    
    Protocol:
    - Connect: ws://host/ws/chat/ (requires JWT token in query string or header)
    - Send message: {"type": "message", "content": "..."}
    - Receive message: {"type": "message", "id": "...", "user_id": ..., "username": "...", "content": "...", "created_at": "...", "is_staff": ...}
    - Error: {"type": "error", "message": "..."}
    """
    
    CHAT_GROUP = "staff_chat"
    
    async def connect(self):
        """Handle WebSocket connection."""
        self.user = self.scope.get("user")
        
        if not self.user or not self.user.is_authenticated:
            await self.close(code=4001)
            return
        
        # Join chat group
        await self.channel_layer.group_add(
            self.CHAT_GROUP,
            self.channel_name
        )
        
        await self.accept()
        
        # Send recent messages on connect
        recent_messages = await self.get_recent_messages()
        await self.send(text_data=json.dumps({
            "type": "history",
            "messages": recent_messages
        }))
    
    async def disconnect(self, close_code):
        """Handle WebSocket disconnection."""
        await self.channel_layer.group_discard(
            self.CHAT_GROUP,
            self.channel_name
        )
    
    async def receive(self, text_data):
        """Handle incoming WebSocket messages."""
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({
                "type": "error",
                "message": "Invalid JSON"
            }))
            return
        
        msg_type = data.get("type")
        
        if msg_type == "message":
            content = data.get("content", "").strip()
            
            if not content:
                await self.send(text_data=json.dumps({
                    "type": "error",
                    "message": "メッセージを入力してください。"
                }))
                return
            
            if len(content) > 500:
                await self.send(text_data=json.dumps({
                    "type": "error",
                    "message": "メッセージは500文字以内で入力してください。"
                }))
                return
            
            # Save message to database
            message_data = await self.save_message(content)
            
            # Broadcast to all connected clients
            await self.channel_layer.group_send(
                self.CHAT_GROUP,
                {
                    "type": "chat_message",
                    "message": message_data
                }
            )
        
        elif msg_type == "ping":
            await self.send(text_data=json.dumps({"type": "pong"}))
        
        elif msg_type == "mark_read":
            # 既読位置を更新
            await self.update_read_status()
            await self.send(text_data=json.dumps({
                "type": "read_confirmed",
                "user_id": self.user.id,
                "timestamp": timezone.now().isoformat()
            }))
    
    async def chat_message(self, event):
        """Handle chat message broadcast."""
        await self.send(text_data=json.dumps({
            "type": "message",
            **event["message"]
        }))
    
    @database_sync_to_async
    def get_recent_messages(self, limit=50):
        """Get recent chat messages from database."""
        from .models import ChatMessage
        
        messages = ChatMessage.objects.select_related('sender').order_by('-created_at')[:limit]
        
        return [msg.to_payload() for msg in reversed(messages)]
    
    @database_sync_to_async
    def save_message(self, content):
        """Save a new chat message to database."""
        from .models import ChatMessage
        
        msg = ChatMessage.objects.create(
            sender=self.user,
            content=content
        )
        
        return msg.to_payload()

    @database_sync_to_async
    def update_read_status(self):
        """Update user's last read timestamp."""
        from .models import ChatMessageRead
        
        ChatMessageRead.objects.update_or_create(
            user=self.user,
            defaults={"last_read_at": timezone.now()}
        )
