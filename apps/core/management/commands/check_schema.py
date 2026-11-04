from django.apps import apps
from django.core.management.base import BaseCommand, CommandError
from django.db import DEFAULT_DB_ALIAS, connections
from django.db.migrations.loader import MigrationLoader


def schema_problems(connection):
    """جدول یا ستونی که مدل‌ها می‌خواهند و در پایگاه داده نیست، یا ستونی که در پایگاه هست و مدل ندارد."""
    problems = []
    with connection.cursor() as cursor:
        tables = set(connection.introspection.table_names(cursor))
        for model in apps.get_models(include_auto_created=True):
            if not model._meta.managed or model._meta.proxy:
                continue
            table = model._meta.db_table
            if table not in tables:
                problems.append(f"جدول {table} ({model._meta.label}) در پایگاه داده نیست.")
                continue
            columns = {column.name for column in connection.introspection.get_table_description(cursor, table)}
            expected = {field.column for field in model._meta.local_concrete_fields}
            for column in sorted(expected - columns):
                problems.append(f"ستون {table}.{column} در پایگاه داده نیست.")
            for column in sorted(columns - expected):
                problems.append(f"ستون {table}.{column} در پایگاه داده هست ولی مدل {model._meta.label} آن را ندارد.")
    return problems


def migration_problems(connection):
    """مهاجرت‌هایی که اجرا نشده‌اند، یا در پایگاه داده اجراشده ثبت شده‌اند ولی فایلشان دیگر نیست."""
    loader = MigrationLoader(connection, ignore_no_migrations=True)
    applied = set(loader.applied_migrations)
    on_disk = set(loader.disk_migrations)
    local_apps = {config.label for config in apps.get_app_configs()}
    problems = [
        f"مهاجرت {app}.{name} اجرا نشده است؛ python manage.py migrate را بزنید."
        for app, name in sorted(on_disk - applied)
    ]
    problems += [
        f"مهاجرت {app}.{name} در پایگاه داده اجراشده ثبت شده ولی فایلش در کد نیست."
        for app, name in sorted(applied - on_disk)
        if app in local_apps
    ]
    return problems


class Command(BaseCommand):
    help = (
        "پایگاه داده را با مدل‌ها و مهاجرت‌ها مقایسه می‌کند: ستون و جدولی که کم یا زیاد است، مهاجرت اجرانشده و "
        "مهاجرتی که اجرا شده ولی فایلش عوض یا حذف شده است. برای پیدا کردن خطاهایی مثل «column ... does not exist»."
    )

    def add_arguments(self, parser):
        parser.add_argument("--database", default=DEFAULT_DB_ALIAS, help="نام پایگاه داده در تنظیمات.")

    def handle(self, *args, **options):
        connection = connections[options["database"]]
        problems = migration_problems(connection) + schema_problems(connection)
        if problems:
            for problem in problems:
                self.stdout.write(self.style.ERROR(problem))
            raise CommandError(f"{len(problems)} ناهمخوانی پیدا شد.")
        self.stdout.write(self.style.SUCCESS("پایگاه داده با مدل‌ها و مهاجرت‌ها هم‌خوان است."))
