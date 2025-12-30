# MATSU API Documentation

## Overview
MATSU is a ticket reservation and management system for the Rakusei Cultural Festival. This document provides comprehensive API documentation for developers.

## Base URL
```
Development: http://localhost:8005/api
Production: https://your-domain.com/api
```

## Authentication
Most endpoints require JWT authentication. Include the token in the Authorization header:
```
Authorization: Bearer <your_access_token>
```

### Obtaining Tokens
**POST** `/auth/login/`

Request:
```json
{
  "username": "your_username",
  "password": "your_password"
}
```

Response:
```json
{
  "access": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}
```

## Rate Limiting
- Checkout operations: 5 requests per minute
- Check-in operations: 30 requests per minute
- Other endpoints: Standard rate limits apply

## Endpoints

### Entry Slots

#### List Entry Slots
**GET** `/slots/`

Lists all active entry slots.

Query Parameters:
- `event_date` (optional): Filter by event date (YYYY-MM-DD)

Response:
```json
[
  {
    "id": "uuid",
    "event_date": "2024-05-15",
    "start_time": "10:00:00",
    "end_time": "11:00:00",
    "capacity": 100,
    "booked_count": 45,
    "remaining": 55,
    "availability_status": "available",
    "is_active": true
  }
]
```

Availability Status:
- `available`: More than 30% remaining
- `limited`: 10-30% remaining
- `few_left`: Less than 10% remaining
- `sold_out`: No slots remaining

#### Get Entry Slot Detail
**GET** `/slots/{id}/`

Returns details for a specific entry slot.

### Attributes

#### List Attribute Configurations
**GET** `/attributes/`

Lists all active attribute configurations (user types).

Response:
```json
[
  {
    "id": "uuid",
    "target_type": "student",
    "display_name": "在校生",
    "max_total_limit": 5,
    "form_schema": [
      {
        "name": "grade",
        "label": "学年",
        "type": "select",
        "options": ["中1", "中2", "中3"]
      }
    ],
    "description": "",
    "sort_order": 0,
    "is_active": true,
    "is_cancellable": true,
    "is_modifiable": true,
    "cancel_deadline_hours": 24
  }
]
```

### Reservations

#### Create Reservation (Checkout)
**POST** `/checkout/`

Creates a new reservation with multiple tickets.

**Rate Limited:** 5 requests per minute

Request:
```json
{
  "user_name": "山田太郎",
  "user_email": "yamada@example.com",
  "guest_identifier": "yamada@example.com",
  "tickets": [
    {
      "slot_id": "uuid",
      "attribute_id": "uuid",
      "guest_info": {
        "name": "山田太郎",
        "grade": "中2"
      }
    }
  ]
}
```

Response (201 Created):
```json
{
  "reservation_id": "R-ABC123DEF456",
  "ticket_ids": ["uuid1", "uuid2"],
  "total_tickets": 2,
  "created_at": "2024-05-15T10:30:00Z"
}
```

Error Response (400 Bad Request):
```json
{
  "errors": {
    "tickets": ["チケットを1つ以上選択してください。"]
  }
}
```

#### List User Reservations
**GET** `/mypage/reservations/`

**Authentication Required**

Lists all reservations for the authenticated user.

Response:
```json
[
  {
    "id": "R-ABC123DEF456",
    "guest_identifier": "user@example.com",
    "user_name": "山田太郎",
    "user_email": "yamada@example.com",
    "total_tickets": 2,
    "created_at": "2024-05-15T10:30:00Z",
    "updated_at": "2024-05-15T10:30:00Z",
    "tickets": [...]
  }
]
```

### Tickets

#### List User Tickets
**GET** `/mypage/tickets/`

**Authentication Required**

Lists all tickets for the authenticated user.

Response:
```json
[
  {
    "id": "uuid",
    "reservation_id": "R-ABC123DEF456",
    "slot": "uuid",
    "slot_detail": {...},
    "attribute": "uuid",
    "attribute_detail": {...},
    "guest_info": {
      "name": "山田太郎",
      "grade": "中2"
    },
    "status": "valid",
    "status_display": "有効",
    "entered_at": null,
    "created_at": "2024-05-15T10:30:00Z"
  }
]
```

Ticket Status:
- `valid`: Valid and unused
- `entered`: Already checked in
- `cancelled`: Cancelled by user

#### Update Ticket Information
**PATCH** `/tickets/{id}/update_info/`

**Authentication Required**

Updates guest information for a ticket.

Request:
```json
{
  "guest_info": {
    "name": "山田花子",
    "grade": "中3"
  }
}
```

Restrictions:
- Only modifiable if `attribute.is_modifiable` is true
- Only valid tickets can be modified

#### Cancel Ticket
**POST** `/tickets/{id}/cancel/`

**Authentication Required**

Cancels a ticket and returns inventory to the slot.

Response:
```json
{
  "status": "cancelled",
  "message": "チケットをキャンセルしました。"
}
```

Error Response (400 Bad Request):
```json
{
  "error": "キャンセル期限を過ぎています。（入場時刻の24時間前まで）"
}
```

### Check-in

#### Process Check-in
**POST** `/checkin/`

**Authentication Required (Admin Only)**
**Rate Limited:** 30 requests per minute

Processes QR code check-in at the gate.

Request:
```json
{
  "ticket_uuid": "uuid",
  "device_id": "GATE_001",
  "operator": "admin_user"
}
```

Success Response (200 OK):
```json
{
  "success": true,
  "message": "入場成功",
  "ticket": {...}
}
```

Error Responses:
- **404 Not Found**: Ticket not found
- **409 Conflict**: Ticket already entered
- **410 Gone**: Ticket is cancelled

### Admin Statistics

#### Get Dashboard Statistics
**GET** `/admin/statistics/`

**Authentication Required (Admin Only)**

Returns comprehensive statistics for the admin dashboard.

Response:
```json
{
  "summary": {
    "total_reservations": 150,
    "total_tickets": 300,
    "checked_in_count": 250,
    "cancelled_count": 10,
    "check_in_rate": 83.3
  },
  "by_attribute": [...],
  "by_slot": [...],
  "sales_trend": [...],
  "recent_activity": [...]
}
```

#### Get Real-time Monitor Data
**GET** `/admin/realtime-monitor/`

**Authentication Required (Admin Only)**

Returns real-time entry monitoring data.

Query Parameters:
- `date` (optional): Filter by event date (default: today)

Response:
```json
{
  "summary": {
    "total_tickets": 300,
    "entered_count": 250,
    "remaining": 50,
    "entry_rate": 83.3
  },
  "slots": [...],
  "recent_checkins": [...],
  "timestamp": "2024-05-15T14:30:00Z"
}
```

### Announcements

#### List Announcements
**GET** `/announcements/`

Lists all active announcements (public endpoint).

Response:
```json
[
  {
    "id": "uuid",
    "title": "重要なお知らせ",
    "content": "本日は雨天のため、一部プログラムを変更いたします。",
    "priority": "warning",
    "priority_display": "注意",
    "is_active": true,
    "target_slot": null,
    "created_at": "2024-05-15T08:00:00Z",
    "updated_at": "2024-05-15T08:00:00Z"
  }
]
```

Priority Levels:
- `info`: お知らせ (Blue)
- `warning`: 注意 (Yellow)
- `critical`: 緊急 (Red)

### Ticket Transfer

#### Create Transfer Link
**POST** `/transfers/create/`

**Authentication Required**

Creates a transfer link to send a ticket to another user.

Request:
```json
{
  "ticket_id": "uuid"
}
```

Response (201 Created):
```json
{
  "success": true,
  "transfer_token": "secure_random_token",
  "transfer_url": "/transfer/secure_random_token",
  "expires_at": "2024-05-17T10:30:00Z"
}
```

Transfer links expire after 48 hours.

#### Accept Transfer
**POST** `/transfers/accept/`

**Authentication Required**

Accepts a ticket transfer from another user.

Request:
```json
{
  "transfer_token": "secure_random_token"
}
```

Response:
```json
{
  "status": "accepted",
  "message": "チケットを受け取りました。",
  "ticket_id": "uuid"
}
```

## Error Handling

All endpoints return errors in a consistent format:

```json
{
  "error": "Error message in Japanese",
  "detail": "Additional error details if available"
}
```

Common HTTP Status Codes:
- `200 OK`: Success
- `201 Created`: Resource created successfully
- `400 Bad Request`: Invalid request data
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Permission denied
- `404 Not Found`: Resource not found
- `409 Conflict`: Resource conflict (e.g., already checked in)
- `410 Gone`: Resource is no longer available
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

## Best Practices

1. **Always use HTTPS in production**
2. **Store JWT tokens securely** (not in localStorage if possible)
3. **Handle rate limiting gracefully** with exponential backoff
4. **Validate input on the client side** before sending requests
5. **Log errors** for debugging and monitoring
6. **Use pagination** for large result sets
7. **Cache frequently accessed data** (slots, attributes)
8. **Implement proper error handling** for all API calls

## Support

For API support, please contact:
- Email: support@matsu-tickets.local
- Documentation: https://github.com/takumitakumiq/newness
