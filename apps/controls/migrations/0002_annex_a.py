"""۹۳ کنترل پیوست A استاندارد ISO/IEC 27001:2022: شماره، عنوان انگلیسی و ترجمه‌ی پیشنهادی فارسی که عضو GRC با
نسخه‌ی رسمی فارسی سازمان تطبیق می‌دهد (جواب س۱۶). متن خود کنترل‌ها اینجا نیست."""

from django.db import migrations

ANNEX_A = [
    ("5.1", "Policies for information security", "خط‌مشی‌های امنیت اطلاعات"),
    ("5.2", "Information security roles and responsibilities", "نقش‌ها و مسئولیت‌های امنیت اطلاعات"),
    ("5.3", "Segregation of duties", "تفکیک وظایف"),
    ("5.4", "Management responsibilities", "مسئولیت‌های مدیریت"),
    ("5.5", "Contact with authorities", "ارتباط با مراجع ذی‌صلاح"),
    ("5.6", "Contact with special interest groups", "ارتباط با گروه‌های تخصصی"),
    ("5.7", "Threat intelligence", "اطلاعات تهدید"),
    ("5.8", "Information security in project management", "امنیت اطلاعات در مدیریت پروژه"),
    ("5.9", "Inventory of information and other associated assets", "فهرست اطلاعات و دیگر دارایی‌های مرتبط"),
    (
        "5.10",
        "Acceptable use of information and other associated assets",
        "استفاده‌ی قابل‌قبول از اطلاعات و دیگر دارایی‌های مرتبط",
    ),
    ("5.11", "Return of assets", "بازگرداندن دارایی‌ها"),
    ("5.12", "Classification of information", "طبقه‌بندی اطلاعات"),
    ("5.13", "Labelling of information", "برچسب‌گذاری اطلاعات"),
    ("5.14", "Information transfer", "انتقال اطلاعات"),
    ("5.15", "Access control", "کنترل دسترسی"),
    ("5.16", "Identity management", "مدیریت هویت"),
    ("5.17", "Authentication information", "اطلاعات احراز هویت"),
    ("5.18", "Access rights", "حقوق دسترسی"),
    ("5.19", "Information security in supplier relationships", "امنیت اطلاعات در روابط با تأمین‌کنندگان"),
    (
        "5.20",
        "Addressing information security within supplier agreements",
        "پرداختن به امنیت اطلاعات در توافق‌نامه‌های تأمین‌کنندگان",
    ),
    (
        "5.21",
        "Managing information security in the information and communication technology (ICT) supply chain",
        "مدیریت امنیت اطلاعات در زنجیره‌ی تأمین فناوری اطلاعات و ارتباطات",
    ),
    (
        "5.22",
        "Monitoring, review and change management of supplier services",
        "پایش، بازنگری و مدیریت تغییر خدمات تأمین‌کنندگان",
    ),
    ("5.23", "Information security for use of cloud services", "امنیت اطلاعات در استفاده از خدمات ابری"),
    (
        "5.24",
        "Information security incident management planning and preparation",
        "برنامه‌ریزی و آمادگی برای مدیریت رخدادهای امنیت اطلاعات",
    ),
    (
        "5.25",
        "Assessment and decision on information security events",
        "ارزیابی و تصمیم‌گیری درباره‌ی رویدادهای امنیت اطلاعات",
    ),
    ("5.26", "Response to information security incidents", "پاسخ به رخدادهای امنیت اطلاعات"),
    ("5.27", "Learning from information security incidents", "درس‌آموزی از رخدادهای امنیت اطلاعات"),
    ("5.28", "Collection of evidence", "گردآوری شواهد"),
    ("5.29", "Information security during disruption", "امنیت اطلاعات در زمان اختلال"),
    ("5.30", "ICT readiness for business continuity", "آمادگی فناوری اطلاعات و ارتباطات برای تداوم کسب‌وکار"),
    (
        "5.31",
        "Legal, statutory, regulatory and contractual requirements",
        "الزامات قانونی، مقرراتی، نظارتی و قراردادی",
    ),
    ("5.32", "Intellectual property rights", "حقوق مالکیت فکری"),
    ("5.33", "Protection of records", "حفاظت از سوابق"),
    (
        "5.34",
        "Privacy and protection of personal identifiable information (PII)",
        "حریم خصوصی و حفاظت از اطلاعات شناسایی شخصی",
    ),
    ("5.35", "Independent review of information security", "بازنگری مستقل امنیت اطلاعات"),
    (
        "5.36",
        "Compliance with policies, rules and standards for information security",
        "انطباق با خط‌مشی‌ها، قواعد و استانداردهای امنیت اطلاعات",
    ),
    ("5.37", "Documented operating procedures", "روش‌های اجرایی مستند"),
    ("6.1", "Screening", "غربالگری"),
    ("6.2", "Terms and conditions of employment", "شرایط و ضوابط استخدام"),
    (
        "6.3",
        "Information security awareness, education and training",
        "آگاهی‌رسانی، آموزش و دوره‌های امنیت اطلاعات",
    ),
    ("6.4", "Disciplinary process", "فرایند انضباطی"),
    (
        "6.5",
        "Responsibilities after termination or change of employment",
        "مسئولیت‌ها پس از پایان یا تغییر اشتغال",
    ),
    ("6.6", "Confidentiality or non-disclosure agreements", "توافق‌نامه‌های محرمانگی یا عدم افشا"),
    ("6.7", "Remote working", "دورکاری"),
    ("6.8", "Information security event reporting", "گزارش رویدادهای امنیت اطلاعات"),
    ("7.1", "Physical security perimeters", "محدوده‌های امنیت فیزیکی"),
    ("7.2", "Physical entry", "ورود فیزیکی"),
    ("7.3", "Securing offices, rooms and facilities", "امن‌سازی دفاتر، اتاق‌ها و تأسیسات"),
    ("7.4", "Physical security monitoring", "پایش امنیت فیزیکی"),
    ("7.5", "Protecting against physical and environmental threats", "حفاظت در برابر تهدیدهای فیزیکی و محیطی"),
    ("7.6", "Working in secure areas", "کار در محدوده‌های امن"),
    ("7.7", "Clear desk and clear screen", "میز پاک و صفحه‌ی پاک"),
    ("7.8", "Equipment siting and protection", "جانمایی و حفاظت از تجهیزات"),
    ("7.9", "Security of assets off-premises", "امنیت دارایی‌های بیرون از محل سازمان"),
    ("7.10", "Storage media", "رسانه‌های ذخیره‌سازی"),
    ("7.11", "Supporting utilities", "تأسیسات پشتیبان"),
    ("7.12", "Cabling security", "امنیت کابل‌کشی"),
    ("7.13", "Equipment maintenance", "نگهداری تجهیزات"),
    ("7.14", "Secure disposal or re-use of equipment", "امحای امن یا استفاده‌ی دوباره از تجهیزات"),
    ("8.1", "User end point devices", "دستگاه‌های نقطه‌ی پایانی کاربر"),
    ("8.2", "Privileged access rights", "حقوق دسترسی ممتاز"),
    ("8.3", "Information access restriction", "محدودسازی دسترسی به اطلاعات"),
    ("8.4", "Access to source code", "دسترسی به کد منبع"),
    ("8.5", "Secure authentication", "احراز هویت امن"),
    ("8.6", "Capacity management", "مدیریت ظرفیت"),
    ("8.7", "Protection against malware", "حفاظت در برابر بدافزار"),
    ("8.8", "Management of technical vulnerabilities", "مدیریت آسیب‌پذیری‌های فنی"),
    ("8.9", "Configuration management", "مدیریت پیکربندی"),
    ("8.10", "Information deletion", "حذف اطلاعات"),
    ("8.11", "Data masking", "پوشاندن داده"),
    ("8.12", "Data leakage prevention", "پیشگیری از نشت داده"),
    ("8.13", "Information backup", "پشتیبان‌گیری از اطلاعات"),
    ("8.14", "Redundancy of information processing facilities", "افزونگی امکانات پردازش اطلاعات"),
    ("8.15", "Logging", "ثبت رویداد"),
    ("8.16", "Monitoring activities", "پایش فعالیت‌ها"),
    ("8.17", "Clock synchronization", "همگام‌سازی ساعت"),
    ("8.18", "Use of privileged utility programs", "استفاده از برنامه‌های کمکی ممتاز"),
    ("8.19", "Installation of software on operational systems", "نصب نرم‌افزار روی سامانه‌های عملیاتی"),
    ("8.20", "Networks security", "امنیت شبکه‌ها"),
    ("8.21", "Security of network services", "امنیت خدمات شبکه"),
    ("8.22", "Segregation of networks", "تفکیک شبکه‌ها"),
    ("8.23", "Web filtering", "پالایش وب"),
    ("8.24", "Use of cryptography", "استفاده از رمزنگاری"),
    ("8.25", "Secure development life cycle", "چرخه‌ی عمر توسعه‌ی امن"),
    ("8.26", "Application security requirements", "الزامات امنیتی برنامه‌های کاربردی"),
    ("8.27", "Secure system architecture and engineering principles", "اصول معماری و مهندسی سامانه‌ی امن"),
    ("8.28", "Secure coding", "کدنویسی امن"),
    ("8.29", "Security testing in development and acceptance", "آزمون امنیت در توسعه و پذیرش"),
    ("8.30", "Outsourced development", "توسعه‌ی برون‌سپاری‌شده"),
    (
        "8.31",
        "Separation of development, test and production environments",
        "جداسازی محیط‌های توسعه، آزمون و عملیات",
    ),
    ("8.32", "Change management", "مدیریت تغییر"),
    ("8.33", "Test information", "اطلاعات آزمون"),
    (
        "8.34",
        "Protection of information systems during audit testing",
        "حفاظت از سامانه‌های اطلاعاتی در طول آزمون ممیزی",
    ),
]


def load(apps, schema_editor):
    IsoControl = apps.get_model("controls", "IsoControl")
    for code, title_en, title in ANNEX_A:
        theme, number = (int(part) for part in code.split("."))
        IsoControl.objects.create(code=code, theme=theme, number=number, title=title, title_en=title_en)


def unload(apps, schema_editor):
    apps.get_model("controls", "Applicability").objects.all().delete()
    apps.get_model("controls", "IsoControl").objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [("controls", "0001_initial")]

    operations = [migrations.RunPython(load, unload)]
