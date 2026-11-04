"""مهاجرت ترمیمی 0002: پایگاهی که نسخه‌ی اول 0001 را اجرا کرده، ستون‌های تازه‌ی پاسخ را می‌گیرد."""

import importlib

import pytest
from django.apps import apps
from django.db import connection

from apps.catalog.tests.factories import make_user
from apps.organization.models import OrgUnit
from apps.questionnaires.models import Questionnaire, Response

pytestmark = pytest.mark.django_db

repair_migration = importlib.import_module("apps.questionnaires.migrations.0002_repair_tables_from_first_0001")
TABLES = ["questionnaires_response", "questionnaires_historicalresponse"]


def columns(table):
    with connection.cursor() as cursor:
        return {column.name for column in connection.introspection.get_table_description(cursor, table)}


def run_repair():
    with connection.schema_editor() as editor:
        repair_migration.repair(apps, editor)


def make_old_schema():
    """جدول‌ها را به شکلی برمی‌گرداند که نسخه‌ی اول 0001 (commit fb28e41) ساخته بود."""
    with connection.cursor() as cursor:
        # ردیف‌هایی که همین تست ساخته کلید خارجی deferred دارند و PostgreSQL تا چک نشوند ALTER TABLE نمی‌پذیرد.
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
        for table in TABLES:
            cursor.execute(f'ALTER TABLE "{table}" RENAME COLUMN "commitments" TO "services_and_commitments"')
            for column in ["functions", "conditions", "current_controls"]:
                cursor.execute(f'ALTER TABLE "{table}" DROP COLUMN "{column}"')


def test_the_repair_brings_back_the_columns_and_keeps_the_old_commitments_text():
    user = make_user("manager")
    response = Response.objects.create(
        questionnaire=Questionnaire.objects.create(title="شناسایی ریسک", is_active=True),
        org_unit=OrgUnit.objects.create(name="عملیات"),
        respondent=user,
        recorded_by=user,
        channel=Response.Channel.QUESTIONNAIRE,
        commitments="پاسخ به تراکنش در کمتر از ۲ ثانیه",
    )
    make_old_schema()
    assert "functions" not in columns("questionnaires_response")

    run_repair()

    for table in TABLES:
        assert {"functions", "commitments", "conditions", "current_controls"} <= columns(table)
        assert "services_and_commitments" not in columns(table)
    response.refresh_from_db()
    assert response.commitments == "پاسخ به تراکنش در کمتر از ۲ ثانیه"
    assert response.functions == response.conditions == response.current_controls == ""
    assert response.history.count() == 1  # جدول تاریخچه هم خوانده می‌شود


def test_the_repair_does_nothing_on_a_fresh_database():
    before = {table: columns(table) for table in TABLES}
    run_repair()
    run_repair()
    assert {table: columns(table) for table in TABLES} == before
