"""
MATSU - Custom Permission Classes and Throttles
"""
from rest_framework.permissions import BasePermission
from rest_framework.throttling import UserRateThrottle


class IsStaffUser(BasePermission):
    """
    スタッフ権限を持つユーザーのみアクセス可能。
    is_staff=True または is_superuser=True のユーザーを許可。
    """
    message = "スタッフ権限が必要です"

    def has_permission(self, request, view):
        return bool(
            request.user and 
            request.user.is_authenticated and 
            (request.user.is_staff or request.user.is_superuser)
        )


class IsStaffOrReadOnly(BasePermission):
    """
    スタッフは全操作可能、その他は読み取りのみ。
    """
    def has_permission(self, request, view):
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return True
        return bool(
            request.user and 
            request.user.is_authenticated and 
            (request.user.is_staff or request.user.is_superuser)
        )


# === Custom Throttle Classes ===

class ChatThrottle(UserRateThrottle):
    """チャット送信用のレート制限: 1分に20回まで"""
    scope = 'chat'


class CheckInThrottle(UserRateThrottle):
    """チェックイン用のレート制限: 1分に60回まで"""
    scope = 'checkin'


class ShareAccessThrottle(UserRateThrottle):
    """共有リンク閲覧のレート制限"""
    scope = 'share'


class EmailOpsThrottle(UserRateThrottle):
    """メール送信操作のレート制限"""
    scope = 'email_ops'
