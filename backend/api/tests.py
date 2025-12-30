"""
Unit tests for MATSU API models
"""
from django.test import TestCase
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta, date, time
from api.models import (
    EntrySlot, AttributeConfig, Reservation, Ticket, 
    CheckInLog, Announcement, TicketTransfer
)
import uuid


class EntrySlotModelTest(TestCase):
    """Test cases for EntrySlot model"""
    
    def setUp(self):
        self.slot = EntrySlot.objects.create(
            event_date=date.today() + timedelta(days=1),
            start_time=time(10, 0),
            end_time=time(11, 0),
            capacity=100,
            booked_count=0,
            is_active=True
        )
    
    def test_remaining_calculation(self):
        """Test remaining property calculation"""
        self.assertEqual(self.slot.remaining, 100)
        
        self.slot.booked_count = 50
        self.slot.save()
        self.assertEqual(self.slot.remaining, 50)
        
        self.slot.booked_count = 100
        self.slot.save()
        self.assertEqual(self.slot.remaining, 0)
    
    def test_availability_status(self):
        """Test availability status property"""
        self.assertEqual(self.slot.availability_status, 'available')
        
        self.slot.booked_count = 75  # 75% booked
        self.slot.save()
        self.assertEqual(self.slot.availability_status, 'limited')
        
        self.slot.booked_count = 95  # 95% booked
        self.slot.save()
        self.assertEqual(self.slot.availability_status, 'few_left')
        
        self.slot.booked_count = 100  # 100% booked
        self.slot.save()
        self.assertEqual(self.slot.availability_status, 'sold_out')
    
    def test_unique_constraint(self):
        """Test unique constraint on event_date and start_time"""
        with self.assertRaises(Exception):
            EntrySlot.objects.create(
                event_date=self.slot.event_date,
                start_time=self.slot.start_time,
                end_time=time(11, 0),
                capacity=50,
            )


class AttributeConfigModelTest(TestCase):
    """Test cases for AttributeConfig model"""
    
    def setUp(self):
        self.attribute = AttributeConfig.objects.create(
            target_type='student',
            display_name='在校生',
            max_total_limit=5,
            form_schema=[
                {'name': 'grade', 'label': '学年', 'type': 'select'}
            ],
            is_active=True
        )
    
    def test_creation(self):
        """Test attribute config creation"""
        self.assertEqual(self.attribute.target_type, 'student')
        self.assertEqual(self.attribute.max_total_limit, 5)
        self.assertTrue(self.attribute.is_active)
    
    def test_unique_target_type(self):
        """Test unique constraint on target_type"""
        with self.assertRaises(Exception):
            AttributeConfig.objects.create(
                target_type='student',  # Duplicate
                display_name='在校生2',
                max_total_limit=3,
            )


class ReservationModelTest(TestCase):
    """Test cases for Reservation model"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
    
    def test_reservation_id_generation(self):
        """Test automatic reservation ID generation"""
        reservation = Reservation.objects.create(
            user=self.user,
            user_name='Test User',
            user_email='test@example.com',
            total_tickets=2
        )
        
        self.assertTrue(reservation.id.startswith('R-'))
        self.assertGreater(len(reservation.id), 10)  # R- + at least 8 chars
    
    def test_guest_reservation(self):
        """Test reservation without user account"""
        reservation = Reservation.objects.create(
            guest_identifier='guest@example.com',
            user_name='Guest User',
            user_email='guest@example.com',
            total_tickets=1
        )
        
        self.assertIsNone(reservation.user)
        self.assertEqual(reservation.guest_identifier, 'guest@example.com')


class TicketModelTest(TestCase):
    """Test cases for Ticket model"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        
        self.slot = EntrySlot.objects.create(
            event_date=date.today() + timedelta(days=1),
            start_time=time(10, 0),
            capacity=100,
        )
        
        self.attribute = AttributeConfig.objects.create(
            target_type='general',
            display_name='一般',
            max_total_limit=5,
        )
        
        self.reservation = Reservation.objects.create(
            user=self.user,
            user_name='Test User',
            user_email='test@example.com',
            total_tickets=1
        )
    
    def test_ticket_creation(self):
        """Test ticket creation"""
        ticket = Ticket.objects.create(
            reservation=self.reservation,
            slot=self.slot,
            attribute=self.attribute,
            guest_info={'name': 'John Doe', 'phone': '090-1234-5678'}
        )
        
        self.assertEqual(ticket.status, Ticket.Status.VALID)
        self.assertIsNone(ticket.entered_at)
        self.assertEqual(ticket.guest_info['name'], 'John Doe')
    
    def test_ticket_status_transitions(self):
        """Test ticket status changes"""
        ticket = Ticket.objects.create(
            reservation=self.reservation,
            slot=self.slot,
            attribute=self.attribute,
        )
        
        # Valid -> Entered
        ticket.status = Ticket.Status.ENTERED
        ticket.entered_at = timezone.now()
        ticket.save()
        self.assertEqual(ticket.status, Ticket.Status.ENTERED)
        self.assertIsNotNone(ticket.entered_at)
        
        # Cancel ticket
        ticket.status = Ticket.Status.CANCELLED
        ticket.save()
        self.assertEqual(ticket.status, Ticket.Status.CANCELLED)


class CheckInLogModelTest(TestCase):
    """Test cases for CheckInLog model"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        
        self.slot = EntrySlot.objects.create(
            event_date=date.today() + timedelta(days=1),
            start_time=time(10, 0),
            capacity=100,
        )
        
        self.attribute = AttributeConfig.objects.create(
            target_type='general',
            display_name='一般',
            max_total_limit=5,
        )
        
        self.reservation = Reservation.objects.create(
            user=self.user,
            user_name='Test User',
            user_email='test@example.com',
            total_tickets=1
        )
        
        self.ticket = Ticket.objects.create(
            reservation=self.reservation,
            slot=self.slot,
            attribute=self.attribute,
        )
    
    def test_checkin_log_creation(self):
        """Test check-in log creation"""
        log = CheckInLog.objects.create(
            ticket=self.ticket,
            action='checkin',
            success=True,
            message='入場成功',
            device_id='DEVICE001',
            operator='admin'
        )
        
        self.assertEqual(log.action, 'checkin')
        self.assertTrue(log.success)
        self.assertEqual(log.operator, 'admin')


class AnnouncementModelTest(TestCase):
    """Test cases for Announcement model"""
    
    def test_announcement_creation(self):
        """Test announcement creation"""
        announcement = Announcement.objects.create(
            title='重要なお知らせ',
            content='システムメンテナンスを行います',
            priority=Announcement.Priority.WARNING,
            is_active=True
        )
        
        self.assertEqual(announcement.title, '重要なお知らせ')
        self.assertEqual(announcement.priority, Announcement.Priority.WARNING)
        self.assertTrue(announcement.is_active)
