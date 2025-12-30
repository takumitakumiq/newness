"""
Email notification utilities for MATSU system
"""
import logging
from django.core.mail import send_mail, EmailMultiAlternatives
from django.template.loader import render_to_string
from django.conf import settings
from django.utils.html import strip_tags

logger = logging.getLogger(__name__)


def send_reservation_confirmation(reservation):
    """
    Send reservation confirmation email
    
    Args:
        reservation: Reservation object
    """
    if not reservation.user_email:
        logger.warning(f"Cannot send confirmation email for reservation {reservation.id}: No email address")
        return False
    
    try:
        subject = f'【MATSU】予約完了のお知らせ - 予約ID: {reservation.id}'
        
        # Context for email template
        context = {
            'reservation': reservation,
            'tickets': reservation.tickets.all(),
        }
        
        # Create plain text message
        message = f"""
洛星文化祭チケットシステム（MATSU）をご利用いただきありがとうございます。

ご予約が完了しました。

■ 予約情報
予約ID: {reservation.id}
予約者名: {reservation.user_name}
チケット枚数: {reservation.total_tickets}枚
予約日時: {reservation.created_at.strftime('%Y年%m月%d日 %H:%M')}

■ チケット詳細
"""
        
        for i, ticket in enumerate(reservation.tickets.all(), 1):
            message += f"""
チケット #{i}
  入場日時: {ticket.slot.event_date} {ticket.slot.start_time}
  属性: {ticket.attribute.display_name}
  チケットID: {ticket.id}
"""
        
        message += """

当日は、マイページからQRコードを表示してご入場ください。

※このメールに心当たりがない場合は、お手数ですが削除してください。

---
洛星文化祭実行委員会
MATSU チケットシステム
"""
        
        # Send email
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL if hasattr(settings, 'DEFAULT_FROM_EMAIL') else 'noreply@matsu-tickets.local',
            recipient_list=[reservation.user_email],
            fail_silently=False,
        )
        
        logger.info(f"Confirmation email sent successfully for reservation {reservation.id}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send confirmation email for reservation {reservation.id}: {str(e)}")
        return False


def send_ticket_transfer_notification(transfer, transfer_url):
    """
    Send ticket transfer notification email
    
    Args:
        transfer: TicketTransfer object
        transfer_url: Full URL for accepting the transfer
    """
    if not transfer.ticket.reservation.user_email:
        logger.warning(f"Cannot send transfer notification for transfer {transfer.id}: No email address")
        return False
    
    try:
        subject = '【MATSU】チケット譲渡のお知らせ'
        
        message = f"""
{transfer.from_user.username}さんからチケットの譲渡があります。

■ チケット情報
入場日時: {transfer.ticket.slot.event_date} {transfer.ticket.slot.start_time}
属性: {transfer.ticket.attribute.display_name}

■ 譲渡を受け取る
以下のリンクから48時間以内に受け取りを完了してください：
{transfer_url}

有効期限: {transfer.expires_at.strftime('%Y年%m月%d日 %H:%M')}

※このメールに心当たりがない場合は、お手数ですが削除してください。

---
洛星文化祭実行委員会
MATSU チケットシステム
"""
        
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL if hasattr(settings, 'DEFAULT_FROM_EMAIL') else 'noreply@matsu-tickets.local',
            recipient_list=[transfer.ticket.reservation.user_email],
            fail_silently=False,
        )
        
        logger.info(f"Transfer notification email sent successfully for transfer {transfer.id}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send transfer notification for transfer {transfer.id}: {str(e)}")
        return False


def send_cancellation_notification(ticket):
    """
    Send ticket cancellation notification email
    
    Args:
        ticket: Ticket object
    """
    if not ticket.reservation.user_email:
        logger.warning(f"Cannot send cancellation notification for ticket {ticket.id}: No email address")
        return False
    
    try:
        subject = '【MATSU】チケットキャンセル完了のお知らせ'
        
        message = f"""
チケットのキャンセルが完了しました。

■ キャンセルされたチケット
予約ID: {ticket.reservation.id}
入場日時: {ticket.slot.event_date} {ticket.slot.start_time}
属性: {ticket.attribute.display_name}
チケットID: {ticket.id}

キャンセル日時: {ticket.updated_at.strftime('%Y年%m月%d日 %H:%M') if ticket.updated_at else ''}

※このメールに心当たりがない場合は、お手数ですがお問い合わせください。

---
洛星文化祭実行委員会
MATSU チケットシステム
"""
        
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL if hasattr(settings, 'DEFAULT_FROM_EMAIL') else 'noreply@matsu-tickets.local',
            recipient_list=[ticket.reservation.user_email],
            fail_silently=False,
        )
        
        logger.info(f"Cancellation notification email sent successfully for ticket {ticket.id}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send cancellation notification for ticket {ticket.id}: {str(e)}")
        return False
