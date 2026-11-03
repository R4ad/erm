"""قفل نسخه‌ی روش در خود PostgreSQL، تا حتی update()، SQL مستقیم یا shell هم نسخه‌ای را که از پیش‌نویس
بیرون آمده عوض نکند. این‌طوری هر ارزیابی با نسخه‌ی خودش دوباره قابل محاسبه می‌ماند (بخش ۲۲ سند v5).

- نسخه‌ی روش هیچ‌وقت حذف نمی‌شود، حتی پیش‌نویس.
- در نسخه‌ای که پیش‌نویس نیست فقط فیلدهای چرخه‌ی عمر (MethodVersion.LIFECYCLE_FIELDS) عوض می‌شوند.
- وضعیت فقط رو به جلو می‌رود: پیش‌نویس، تصویب‌شده، فعال، بایگانی. نسخه‌ای که پیش‌نویس نیست دیگر پیش‌نویس
  نمی‌شود، وگرنه قفل محتوا معنایی نداشت. تصویبی که ثبت شد و زمان فعال شدن هم عوض نمی‌شوند.
- ردیف جدول‌های نسخه فقط وقتی ساخته، ویرایش یا حذف می‌شود که نسخه‌اش پیش‌نویس باشد.

سرویس‌های services.py همین قاعده‌ها را پیش از ذخیره با پیام روشن چک می‌کنند؛ این‌جا لایه‌ی آخر است.
"""

from django.db import migrations

# جدول‌هایی که ستون version_id دارند. سطح مقیاس نسخه را از راه مقیاسش پیدا می‌کند و trigger جدا دارد.
PART_TABLES = ["scale", "likelihoodcell", "risklevel", "impactfloor", "bcrule", "methodparameter"]

FORWARD = """
CREATE FUNCTION methodology_is_draft(version bigint) RETURNS boolean AS $$
    SELECT status = 'draft' FROM methodology_methodversion WHERE id = version;
$$ LANGUAGE sql STABLE;

CREATE FUNCTION methodology_scale_version(scale bigint) RETURNS bigint AS $$
    SELECT version_id FROM methodology_scale WHERE id = scale;
$$ LANGUAGE sql STABLE;

CREATE FUNCTION methodology_version_guard() RETURNS trigger AS $$
DECLARE
    -- همان MethodVersion.LIFECYCLE_FIELDS با نام ستون‌ها، به‌اضافه‌ی updated_at که هر ذخیره عوضش می‌کند
    lifecycle text[] := ARRAY['status', 'approval_ref', 'approved_on', 'approval_recorded_by_id',
                              'activated_at', 'activated_by_id', 'updated_at'];
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'نسخه‌ی روش حذف نمی‌شود.';
    END IF;
    -- to_jsonb ردیف را شیء JSON می‌کند. بعد از برداشتن فیلدهای چرخه‌ی عمر، بقیه نباید عوض شده باشند.
    IF OLD.status <> 'draft' AND to_jsonb(NEW) - lifecycle IS DISTINCT FROM to_jsonb(OLD) - lifecycle THEN
        RAISE EXCEPTION 'نسخه‌ی % پیش‌نویس نیست و محتوایش عوض نمی‌شود.', OLD.number;
    END IF;
    IF NEW.status <> OLD.status AND (OLD.status, NEW.status) NOT IN
        (('draft', 'approved'), ('approved', 'active'), ('active', 'archived')) THEN
        RAISE EXCEPTION 'نسخه‌ی % از وضعیت % به % نمی‌رود.', OLD.number, OLD.status, NEW.status;
    END IF;
    IF OLD.approved_on IS NOT NULL
        AND (NEW.approval_ref, NEW.approved_on, NEW.approval_recorded_by_id)
            IS DISTINCT FROM (OLD.approval_ref, OLD.approved_on, OLD.approval_recorded_by_id) THEN
        RAISE EXCEPTION 'تصویب ثبت‌شده‌ی نسخه‌ی % عوض نمی‌شود.', OLD.number;
    END IF;
    IF (NEW.activated_at, NEW.activated_by_id) IS DISTINCT FROM (OLD.activated_at, OLD.activated_by_id)
        AND NOT (OLD.status = 'approved' AND NEW.status = 'active') THEN
        RAISE EXCEPTION 'زمان فعال شدن نسخه‌ی % فقط هنگام فعال شدن ثبت می‌شود.', OLD.number;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER methodology_version_guard
    BEFORE UPDATE OR DELETE ON methodology_methodversion
    FOR EACH ROW EXECUTE FUNCTION methodology_version_guard();

-- در ساختن ردیف فقط NEW هست، در حذف فقط OLD و در ویرایش هر دو. هر دو چک می‌شوند تا ردیفی نه از نسخه‌ی
-- قفل بیرون برده شود و نه به آن. ردیفی که نیست (مثل OLD در ساختن) NULL خوانده می‌شود و چیزی را رد نمی‌کند.
CREATE FUNCTION methodology_part_guard() RETURNS trigger AS $$
BEGIN
    IF (TG_OP <> 'INSERT' AND NOT methodology_is_draft(OLD.version_id))
        OR (TG_OP <> 'DELETE' AND NOT methodology_is_draft(NEW.version_id)) THEN
        RAISE EXCEPTION 'جدول‌های نسخه‌ای که پیش‌نویس نیست عوض نمی‌شوند.';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION methodology_scale_level_guard() RETURNS trigger AS $$
BEGIN
    IF (TG_OP <> 'INSERT' AND NOT methodology_is_draft(methodology_scale_version(OLD.scale_id)))
        OR (TG_OP <> 'DELETE' AND NOT methodology_is_draft(methodology_scale_version(NEW.scale_id))) THEN
        RAISE EXCEPTION 'جدول‌های نسخه‌ای که پیش‌نویس نیست عوض نمی‌شوند.';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER methodology_scalelevel_guard
    BEFORE INSERT OR UPDATE OR DELETE ON methodology_scalelevel
    FOR EACH ROW EXECUTE FUNCTION methodology_scale_level_guard();
""" + "".join(
    f"""
CREATE TRIGGER methodology_{table}_guard
    BEFORE INSERT OR UPDATE OR DELETE ON methodology_{table}
    FOR EACH ROW EXECUTE FUNCTION methodology_part_guard();
"""
    for table in PART_TABLES
)

# CASCADE هر trigger را هم که از این تابع‌ها استفاده می‌کند پاک می‌کند.
BACKWARD = """
DROP FUNCTION methodology_version_guard() CASCADE;
DROP FUNCTION methodology_part_guard() CASCADE;
DROP FUNCTION methodology_scale_level_guard() CASCADE;
DROP FUNCTION methodology_scale_version(bigint);
DROP FUNCTION methodology_is_draft(bigint);
"""


class Migration(migrations.Migration):
    dependencies = [("methodology", "0002_method_version_1")]

    operations = [migrations.RunSQL(FORWARD, BACKWARD)]
