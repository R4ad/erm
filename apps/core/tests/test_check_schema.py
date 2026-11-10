import pytest
from django.core.management import CommandError, call_command
from django.db import connection

pytestmark = pytest.mark.django_db


def test_a_matching_database_passes(capsys):
    call_command("check_schema")
    assert "هم‌خوان است" in capsys.readouterr().out


def test_missing_columns_and_lost_migration_files_are_reported(capsys):
    with connection.cursor() as cursor:
        cursor.execute('ALTER TABLE "questionnaires_response" DROP COLUMN "functions"')
        cursor.execute(
            "INSERT INTO django_migrations (app, name, applied) VALUES ('risks', '0099_removed_from_branch', now())"
        )

    with pytest.raises(CommandError, match="2 ناهمخوانی"):
        call_command("check_schema")

    out = capsys.readouterr().out
    assert "ستون questionnaires_response.functions در پایگاه داده نیست." in out
    assert "مهاجرت risks.0099_removed_from_branch در پایگاه داده اجراشده ثبت شده ولی فایلش در کد نیست." in out
