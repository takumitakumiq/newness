"""
Management command to create sample data for development
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import date, time, timedelta
from api.models import EntrySlot, AttributeConfig


class Command(BaseCommand):
    help = 'Create sample data for MATSU development'

    def handle(self, *args, **options):
        self.stdout.write('Creating sample data...')
        
        # Create Attribute Configs
        attributes = [
            {
                'target_type': 'parent',
                'display_name': '保護者',
                'max_total_limit': 5,
                'description': '在校生の保護者の方',
                'form_schema': [
                    {
                        'key': 'student_name',
                        'label': '生徒氏名',
                        'type': 'text',
                        'required': True
                    },
                    {
                        'key': 'student_class',
                        'label': 'クラス',
                        'type': 'text',
                        'required': True,
                        'placeholder': '例: 1-A'
                    },
                    {
                        'key': 'car',
                        'label': '駐車場利用',
                        'type': 'boolean',
                        'description': '駐車場を利用しますか？'
                    }
                ],
                'sort_order': 1
            },
            {
                'target_type': 'student',
                'display_name': '在校生',
                'max_total_limit': 2,
                'description': '洛星の在校生',
                'form_schema': [
                    {
                        'key': 'student_id',
                        'label': '学籍番号',
                        'type': 'text',
                        'required': True
                    }
                ],
                'sort_order': 2
            },
            {
                'target_type': 'alumni',
                'display_name': '卒業生',
                'max_total_limit': 3,
                'description': '洛星の卒業生',
                'form_schema': [
                    {
                        'key': 'graduation_year',
                        'label': '卒業年度',
                        'type': 'number',
                        'required': True,
                        'placeholder': '例: 2020'
                    }
                ],
                'sort_order': 3
            },
            {
                'target_type': 'general',
                'display_name': '一般来場者',
                'max_total_limit': 4,
                'description': '一般のお客様',
                'form_schema': [
                    {
                        'key': 'name',
                        'label': 'お名前',
                        'type': 'text',
                        'required': True
                    },
                    {
                        'key': 'phone',
                        'label': '電話番号',
                        'type': 'tel',
                        'required': False,
                        'placeholder': '例: 090-1234-5678'
                    }
                ],
                'sort_order': 4
            }
        ]
        
        for attr_data in attributes:
            attr, created = AttributeConfig.objects.update_or_create(
                target_type=attr_data['target_type'],
                defaults=attr_data
            )
            status = 'Created' if created else 'Updated'
            self.stdout.write(f'  {status}: {attr.display_name}')
        
        # Create Entry Slots (2 days, multiple time slots)
        # Use future dates
        day1 = date(2025, 10, 25)  # Saturday
        day2 = date(2025, 10, 26)  # Sunday
        
        time_slots = [
            (time(10, 0), time(11, 0), 100),
            (time(11, 0), time(12, 0), 100),
            (time(12, 0), time(13, 0), 80),
            (time(13, 0), time(14, 0), 100),
            (time(14, 0), time(15, 0), 100),
            (time(15, 0), time(16, 0), 80),
        ]
        
        for event_date in [day1, day2]:
            for start, end, capacity in time_slots:
                slot, created = EntrySlot.objects.update_or_create(
                    event_date=event_date,
                    start_time=start,
                    defaults={
                        'end_time': end,
                        'capacity': capacity,
                        'is_active': True
                    }
                )
                status = 'Created' if created else 'Updated'
                self.stdout.write(f'  {status}: {event_date} {start}-{end}')
        
        self.stdout.write(self.style.SUCCESS('Sample data created successfully!'))
