"""
Management command to backup database
Usage: python manage.py backup_database
"""
import os
import json
from datetime import datetime
from django.core.management.base import BaseCommand
from django.core import serializers
from django.conf import settings
from api.models import EntrySlot, AttributeConfig, Reservation, Ticket, CheckInLog, Announcement, TicketTransfer, PromoCode


class Command(BaseCommand):
    help = 'Backup database to JSON file'

    def add_arguments(self, parser):
        parser.add_argument(
            '--output-dir',
            type=str,
            default='backups',
            help='Directory to save backup files (default: backups/)'
        )

    def handle(self, *args, **options):
        output_dir = options['output_dir']
        
        # Create backup directory if it doesn't exist
        os.makedirs(output_dir, exist_ok=True)
        
        # Generate filename with timestamp
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'matsu_backup_{timestamp}.json'
        filepath = os.path.join(output_dir, filename)
        
        self.stdout.write(self.style.SUCCESS(f'Starting database backup...'))
        
        # Models to backup
        models_to_backup = [
            EntrySlot,
            AttributeConfig,
            Reservation,
            Ticket,
            CheckInLog,
            Announcement,
            TicketTransfer,
            PromoCode,
        ]
        
        backup_data = []
        total_objects = 0
        
        for model in models_to_backup:
            objects = model.objects.all()
            count = objects.count()
            total_objects += count
            
            if count > 0:
                serialized = serializers.serialize('json', objects)
                backup_data.extend(json.loads(serialized))
                self.stdout.write(f'  ✓ Backed up {count} {model.__name__} objects')
        
        # Write backup to file
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(backup_data, f, ensure_ascii=False, indent=2)
        
        # Get file size
        file_size = os.path.getsize(filepath)
        size_mb = file_size / (1024 * 1024)
        
        self.stdout.write(self.style.SUCCESS(
            f'\n✓ Backup completed successfully!'
        ))
        self.stdout.write(f'  Total objects backed up: {total_objects}')
        self.stdout.write(f'  File: {filepath}')
        self.stdout.write(f'  Size: {size_mb:.2f} MB')
        
        # Keep only last 10 backups
        self._cleanup_old_backups(output_dir, keep=10)
    
    def _cleanup_old_backups(self, backup_dir, keep=10):
        """Remove old backup files, keeping only the most recent ones"""
        try:
            backup_files = [
                f for f in os.listdir(backup_dir)
                if f.startswith('matsu_backup_') and f.endswith('.json')
            ]
            
            if len(backup_files) > keep:
                # Sort by filename (which includes timestamp)
                backup_files.sort()
                files_to_remove = backup_files[:-keep]
                
                for filename in files_to_remove:
                    filepath = os.path.join(backup_dir, filename)
                    os.remove(filepath)
                    self.stdout.write(f'  Removed old backup: {filename}')
                
                self.stdout.write(f'  Cleaned up {len(files_to_remove)} old backup(s)')
        except Exception as e:
            self.stdout.write(self.style.WARNING(f'  Warning: Could not cleanup old backups: {str(e)}'))
