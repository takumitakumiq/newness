"""
MATSU - Email Service
SendGrid integration with test/production mode support
"""
import logging
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)


class EmailService:
    """
    メール送信サービス
    テストモード: ログ出力のみ
    本番モード: SendGrid API で実際に送信
    """
    
    def __init__(self):
        self._settings = None
    
    @property
    def settings(self):
        """Get cached settings or fetch from DB."""
        if self._settings is None:
            from .models import SystemSetting
            self._settings = SystemSetting.get_instance()
        return self._settings
    
    def refresh_settings(self):
        """Refresh settings from DB."""
        self._settings = None
    
    def send_email(
        self,
        to_emails: List[str],
        subject: str,
        html_content: str,
        text_content: Optional[str] = None,
        template_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        メール送信
        
        Args:
            to_emails: 宛先メールアドレスのリスト
            subject: 件名
            html_content: HTML本文
            text_content: プレーンテキスト本文（省略時はHTMLから生成）
            template_data: テンプレート変数（将来用）
        
        Returns:
            {
                "success": bool,
                "mode": "test" | "production",
                "message": str,
                "details": {...}  # 詳細情報
            }
        """
        self.refresh_settings()
        settings = self.settings
        
        from .models import SystemSetting
        
        if settings.email_mode == SystemSetting.EmailMode.TEST:
            return self._send_test_mode(to_emails, subject, html_content)
        else:
            return self._send_production_mode(to_emails, subject, html_content, text_content)
    
    def _send_test_mode(
        self,
        to_emails: List[str],
        subject: str,
        html_content: str
    ) -> Dict[str, Any]:
        """テストモード: ログ出力のみ"""
        logger.info(f"[EMAIL TEST MODE] To: {to_emails}, Subject: {subject}")
        logger.debug(f"[EMAIL TEST MODE] Content: {html_content[:200]}...")
        
        return {
            "success": True,
            "mode": "test",
            "message": f"テストモード: {len(to_emails)}件のメールをログに記録しました",
            "details": {
                "to": to_emails,
                "subject": subject,
                "logged": True
            }
        }
    
    def _send_production_mode(
        self,
        to_emails: List[str],
        subject: str,
        html_content: str,
        text_content: Optional[str] = None
    ) -> Dict[str, Any]:
        """本番モード: SendGrid API で送信"""
        settings = self.settings
        
        if not settings.sendgrid_api_key:
            return {
                "success": False,
                "mode": "production",
                "message": "SendGrid APIキーが設定されていません",
                "details": {}
            }
        
        try:
            from sendgrid import SendGridAPIClient
            from sendgrid.helpers.mail import Mail, Email, To, Content
        except ImportError:
            return {
                "success": False,
                "mode": "production",
                "message": "sendgridパッケージがインストールされていません。pip install sendgrid を実行してください。",
                "details": {}
            }
        
        try:
            sg = SendGridAPIClient(api_key=settings.sendgrid_api_key)
            
            from_email = Email(settings.email_from_address, settings.email_from_name)
            to_list = [To(email) for email in to_emails]
            
            # メール作成
            message = Mail(
                from_email=from_email,
                to_emails=to_list,
                subject=subject,
                html_content=html_content
            )
            
            if text_content:
                message.add_content(Content("text/plain", text_content))
            
            # 送信
            response = sg.send(message)
            
            logger.info(f"[EMAIL SENT] To: {to_emails}, Subject: {subject}, Status: {response.status_code}")
            
            return {
                "success": response.status_code in [200, 201, 202],
                "mode": "production",
                "message": f"送信完了 (Status: {response.status_code})",
                "details": {
                    "status_code": response.status_code,
                    "to": to_emails,
                    "subject": subject
                }
            }
            
        except Exception as e:
            logger.error(f"[EMAIL ERROR] {str(e)}")
            return {
                "success": False,
                "mode": "production",
                "message": f"送信エラー: {str(e)}",
                "details": {"error": str(e)}
            }
    
    # === メールテンプレート ===
    
    def send_reservation_confirmation(
        self,
        to_email: str,
        reservation_id: str,
        user_name: str,
        tickets: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """予約完了メール"""
        subject = f"【MATSU】ご予約完了のお知らせ ({reservation_id})"
        
        ticket_rows = ""
        for t in tickets:
            ticket_rows += f"""
            <tr>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">{t.get('guest_name', '未入力')}</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">{t.get('slot_date', '')} {t.get('slot_time', '')}</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">{t.get('attribute_name', '')}</td>
            </tr>
            """
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="font-family: sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h1 style="color: #4F46E5;">🎪 ご予約ありがとうございます</h1>
                
                <p>{user_name} 様</p>
                
                <p>以下の内容でご予約を承りました。</p>
                
                <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>予約番号:</strong> {reservation_id}</p>
                </div>
                
                <h2 style="font-size: 18px; border-bottom: 2px solid #4F46E5; padding-bottom: 8px;">チケット情報</h2>
                
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: #f1f5f9;">
                            <th style="padding: 8px; text-align: left;">お名前</th>
                            <th style="padding: 8px; text-align: left;">日時</th>
                            <th style="padding: 8px; text-align: left;">種別</th>
                        </tr>
                    </thead>
                    <tbody>
                        {ticket_rows}
                    </tbody>
                </table>
                
                <div style="margin-top: 30px; padding: 16px; background: #fef3c7; border-radius: 8px;">
                    <p style="margin: 0;"><strong>📱 当日はマイページからQRコードを提示してください。</strong></p>
                </div>
                
                <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
                <p style="font-size: 12px; color: #666;">
                    このメールは自動送信です。ご不明点がございましたらお問い合わせください。
                </p>
            </div>
        </body>
        </html>
        """
        
        return self.send_email([to_email], subject, html_content)
    
    def send_transfer_notification(
        self,
        to_email: str,
        from_user_name: str,
        ticket_info: Dict[str, Any],
        transfer_url: str
    ) -> Dict[str, Any]:
        """チケット譲渡通知メール"""
        subject = "【MATSU】チケットが譲渡されました"
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="font-family: sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h1 style="color: #4F46E5;">🎫 チケットが譲渡されました</h1>
                
                <p>{from_user_name} さんからチケットが譲渡されました。</p>
                
                <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>日時:</strong> {ticket_info.get('slot_date', '')} {ticket_info.get('slot_time', '')}</p>
                    <p><strong>種別:</strong> {ticket_info.get('attribute_name', '')}</p>
                </div>
                
                <p>以下のリンクから受け取ってください：</p>
                
                <a href="{transfer_url}" style="display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">
                    チケットを受け取る
                </a>
                
                <p style="font-size: 14px; color: #666;">
                    ※ 受け取りにはログインが必要です。<br>
                    ※ リンクの有効期限にご注意ください。
                </p>
                
                <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
                <p style="font-size: 12px; color: #666;">
                    このメールは自動送信です。
                </p>
            </div>
        </body>
        </html>
        """
        
        return self.send_email([to_email], subject, html_content)
    
    def send_checkin_reminder(
        self,
        to_email: str,
        user_name: str,
        tickets: List[Dict[str, Any]],
        event_date: str
    ) -> Dict[str, Any]:
        """入場リマインダーメール"""
        subject = f"【MATSU】本日のご来場について ({event_date})"
        
        ticket_list = ""
        for t in tickets:
            ticket_list += f"<li>{t.get('slot_time', '')} - {t.get('attribute_name', '')} ({t.get('guest_name', '')})</li>"
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="font-family: sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h1 style="color: #4F46E5;">🎪 本日のご来場をお待ちしております</h1>
                
                <p>{user_name} 様</p>
                
                <p>本日 {event_date} のチケットをお持ちです。</p>
                
                <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="margin-top: 0;">ご予約内容</h3>
                    <ul>{ticket_list}</ul>
                </div>
                
                <div style="background: #fef3c7; padding: 16px; border-radius: 8px;">
                    <p style="margin: 0;"><strong>📱 入場時はマイページからQRコードを提示してください。</strong></p>
                </div>
                
                <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
                <p style="font-size: 12px; color: #666;">
                    このメールは自動送信です。
                </p>
            </div>
        </body>
        </html>
        """
        
        return self.send_email([to_email], subject, html_content)


# シングルトンインスタンス
email_service = EmailService()
