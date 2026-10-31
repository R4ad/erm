"""لایه‌ی دوم حفاظت: خود PostgreSQL هم ویرایش و حذف رویدادها را رد می‌کند، حتی با SQL مستقیم یا shell."""

from django.db import migrations

FORWARD = """
CREATE FUNCTION audit_event_is_read_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Audit Log events cannot be changed or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_event_read_only
    BEFORE UPDATE OR DELETE ON audit_auditevent
    FOR EACH ROW EXECUTE FUNCTION audit_event_is_read_only();
"""

BACKWARD = """
DROP TRIGGER audit_event_read_only ON audit_auditevent;
DROP FUNCTION audit_event_is_read_only();
"""


class Migration(migrations.Migration):
    dependencies = [("audit", "0001_initial")]

    operations = [migrations.RunSQL(FORWARD, BACKWARD)]
