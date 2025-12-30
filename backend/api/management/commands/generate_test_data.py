"""
Management command to generate sample data for testing
Usage: python manage.py generate_test_data
"""
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import date, time, timedelta
import random
from api.models import EntrySlot, AttributeConfig, Reservation, Ticket


class Command(BaseCommand):
    help = 'Generate sample test data for development and testing'

    def add_arguments(self, parser):
        parser.add_argument(
            '--slots',
            type=int,
            default=10,
            help='Number of entry slots to create (default: 10)'
        )
        parser.add_argument(
            '--users',
            type=int,
            default=20,
            help='Number of test users to create (default: 20)'
        )
        parser.add_argument(
            '--reservations',
            type=int,
            default=30,
            help='Number of reservations to create (default: 30)'
        )

    def handle(self, *args, **options):
        num_slots = options['slots']
        num_users = options['users']
        num_reservations = options['reservations']
        
        self.stdout.write(self.style.SUCCESS('Starting test data generation...'))
        
        # Create attributes if they don't exist
        self._create_attributes()
        
        # Create entry slots
        slots = self._create_slots(num_slots)
        
        # Create test users
        users = self._create_users(num_users)
        
        # Create reservations and tickets
        self._create_reservations(num_reservations, users, slots)
        
        self.stdout.write(self.style.SUCCESS('\n✓ Test data generation completed successfully!'))
        self.stdout.write(f'  Entry Slots: {num_slots}')
        self.stdout.write(f'  Users: {num_users}')
        self.stdout.write(f'  Reservations: {num_reservations}')

    def _create_attributes(self):
        """Create attribute configurations"""
        attributes_data = [
            {
                'target_type': 'student',
                'display_name': '在校生',
                'max_total_limit': 5,
                'form_schema': [
                    {'key': 'name', 'label': '氏名', 'type': 'text', 'required': True},
                    {'key': 'grade', 'label': '学年', 'type': 'select', 'required': True, 
                     'options': [{'value': '中1', 'label': '中学1年'}, {'value': '中2', 'label': '中学2年'}]},
                ]
            },
            {
                'target_type': 'parent',
                'display_name': '保護者',
                'max_total_limit': 3,
                'form_schema': [
                    {'key': 'name', 'label': '氏名', 'type': 'text', 'required': True},
                    {'key': 'phone', 'label': '電話番号', 'type': 'tel', 'required': True},
                ]
            },
            {
                'target_type': 'general',
                'display_name': '一般',
                'max_total_limit': 4,
                'form_schema': [
                    {'key': 'name', 'label': '氏名', 'type': 'text', 'required': True},
                ]
            },
        ]
        
        created_count = 0
        for attr_data in attributes_data:
            _, created = AttributeConfig.objects.get_or_create(
                target_type=attr_data['target_type'],
                defaults=attr_data
            )
            if created:
                created_count += 1
        
        if created_count > 0:
            self.stdout.write(f'  ✓ Created {created_count} attribute configurations')

    def _create_slots(self, count):
        """Create entry slots"""
        slots = []
        base_date = date.today() + timedelta(days=7)
        
        for i in range(count):
            event_date = base_date + timedelta(days=i // 4)
            hour = 10 + (i % 4) * 2
            
            slot, created = EntrySlot.objects.get_or_create(
                event_date=event_date,
                start_time=time(hour, 0),
                defaults={
                    'end_time': time(hour + 1, 0),
                    'capacity': random.randint(50, 150),
                    'booked_count': 0,
                    'is_active': True,
                }
            )
            slots.append(slot)
        
        self.stdout.write(f'  ✓ Created/verified {count} entry slots')
        return slots

    def _create_users(self, count):
        """Create test users"""
        users = []
        for i in range(count):
            username = f'testuser{i+1:03d}'
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    'email': f'{username}@example.com',
                    'first_name': f'テスト',
                    'last_name': f'ユーザー{i+1}',
                }
            )
            if created:
                user.set_password('testpass123')
                user.save()
            users.append(user)
        
        self.stdout.write(f'  ✓ Created {count} test users')
        return users

    def _create_reservations(self, count, users, slots):
        """Create reservations and tickets"""
        attributes = list(AttributeConfig.objects.filter(is_active=True))
        
        for i in range(count):
            user = random.choice(users)
            num_tickets = random.randint(1, 3)
            
            # Create reservation
            reservation = Reservation.objects.create(
                user=user,
                user_name=f'{user.last_name} {user.first_name}',
                user_email=user.email,
                guest_identifier=user.email,
                total_tickets=num_tickets
            )
            
            # Create tickets
            for j in range(num_tickets):
                slot = random.choice(slots)
                attribute = random.choice(attributes)
                
                # Generate sample guest info
                guest_info = {
                    'name': f'{user.last_name} {user.first_name}',
                }
                
                if 'phone' in [f['key'] for f in attribute.form_schema]:
                    guest_info['phone'] = f'090-{random.randint(1000,9999)}-{random.randint(1000,9999)}'
                
                if 'grade' in [f['key'] for f in attribute.form_schema]:
                    guest_info['grade'] = random.choice(['中1', '中2', '中3'])
                
                # Random status
                status = Ticket.Status.VALID
                entered_at = None
                if random.random() < 0.3:  # 30% chance of being entered
                    status = Ticket.Status.ENTERED
                    entered_at = timezone.now() - timedelta(days=random.randint(0, 3))
                elif random.random() < 0.05:  # 5% chance of being cancelled
                    status = Ticket.Status.CANCELLED
                
                Ticket.objects.create(
                    reservation=reservation,
                    slot=slot,
                    attribute=attribute,
                    guest_info=guest_info,
                    status=status,
                    entered_at=entered_at
                )
                
                # Update slot booking count if valid
                if status != Ticket.Status.CANCELLED:
                    slot.booked_count += 1
                    slot.save()
        
        self.stdout.write(f'  ✓ Created {count} reservations with tickets')
