from django.db import migrations


def create_questionnaire(apps, schema_editor):
    Questionnaire = apps.get_model("questionnaires", "Questionnaire")
    Question = apps.get_model("questionnaires", "Question")
    title = "پرسشنامه مشترک شناسایی اختلال خدمت"
    while Questionnaire.objects.filter(title=title).exists():
        title += " (جدید)"
    questionnaire = Questionnaire.objects.create(
        title=title,
        is_active=True,
        is_structured=True,
        description="خدمت، اتفاق‌ها، مسیرهای اختلال و شواهد مربوط به هر مسیر را ثبت کنید.",
    )
    questions = [
        ("service", "کدام خدمت و چه محدوده‌ای را بررسی می‌کنیم؟"),
        ("purpose", "این خدمت چه کاری را برای شرکت ممکن می‌کند؟"),
        ("objective", "چه انتظار زمانی یا کیفی از این خدمت وجود دارد؟"),
        ("event", "چه اتفاقی می‌تواند مانع ارائه این خدمت شود؟"),
        ("path", "این خرابی چگونه به قطع خدمت منجر می‌شود؟"),
        ("control", "برای جلوگیری از قطع خدمت در این وضعیت چه تمهیدی دارید؟"),
        ("recovery", "اگر خدمت قطع شود، چه کاری برای برقراری مجدد انجام می‌دهید؟"),
        ("consequence", "قطع این خدمت چه کسی را متأثر می‌کند و چه مشکلی ایجاد می‌شود؟"),
        ("evidence", "چه سابقه یا مدرکی برای بررسی این وضعیت دارید؟"),
    ]
    for order, (stage, text) in enumerate(questions, 1):
        Question.objects.create(
            questionnaire=questionnaire,
            order=order,
            stage=stage,
            text=text,
            kind="text",
        )


class Migration(migrations.Migration):
    dependencies = [("questionnaires", "0004_historicalquestion_stage_and_more")]
    operations = [migrations.RunPython(create_questionnaire, migrations.RunPython.noop)]
