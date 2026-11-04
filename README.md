# سامانه‌ی مدیریت ریسک سازمانی (ERM)

سامانه‌ی تحت وب ثبت و ارزیابی ریسک، اقدامات کاهشی، گردش کار تأیید و گزارش، با Django و PostgreSQL.
رابط کاربری فارسی و راست‌چین است و روی سرور داخلی سازمان با Docker اجرا می‌شود.

## پیش‌نیازها

- برای اجرای کامل روی سرور: Docker و Docker Compose
- برای توسعه روی سیستم خودتان: Python 3.14، pipenv و Docker (فقط برای PostgreSQL)

## تنظیمات (‎.env)

همه‌ی تنظیمات از فایل ‎`.env` در ریشه‌ی پروژه خوانده می‌شود. یک نمونه‌ی توضیح‌دار در ‎`.env.example` هست:

```bash
cp .env.example .env
```

سپس دست‌کم `SECRET_KEY` و `POSTGRES_PASSWORD` را عوض کنید و همان رمز را در `DATABASE_URL` هم بگذارید.
فایل ‎`.env` در git ثبت نمی‌شود.

## اجرای کامل با Docker (سرور)

```bash
docker compose --profile prod up -d --build
```

این دستور سه سرویس را بالا می‌آورد:

| سرویس | کار |
|---|---|
| `db` | پایگاه داده‌ی PostgreSQL 17 |
| `web` | برنامه‌ی Django با gunicorn؛ هنگام شروع، migrate و collectstatic را خودکار اجرا می‌کند |
| `nginx` | روی پورت 80 درخواست‌ها را به `web` می‌دهد و فایل‌های static را مستقیم سرو می‌کند |

سامانه روی `http://<نام سرور>/` باز می‌شود. نام سرور باید در `ALLOWED_HOSTS` باشد.
ساختن اولین کاربر مدیر:

```bash
docker compose exec web python manage.py createsuperuser
```

## توسعه روی سیستم خودتان

فقط پایگاه داده را با Docker بالا بیاورید (بدون پروفایل prod فقط `db` اجرا می‌شود):

```bash
docker compose up -d db
pipenv install --dev
pipenv run python manage.py migrate
pipenv run python manage.py createsuperuser
pipenv run python manage.py runserver
```

سامانه روی `http://127.0.0.1:8000/` باز می‌شود.

### خطای «column ... does not exist»

اگر صفحه‌ای با خطای `ProgrammingError` و «column ... does not exist» یا «relation ... does not exist» باز نشد، اول
`migrate` و بعد این دستور را بزنید:

```bash
pipenv run python manage.py migrate
pipenv run python manage.py check_schema
```

`check_schema` پایگاه داده را با مدل‌ها و مهاجرت‌ها مقایسه می‌کند و ستون یا جدول کم و زیاد، مهاجرت اجرانشده و
مهاجرتی را که اجرا شده ولی فایلش دیگر نیست، نام می‌برد.

مهاجرتی که در شاخه‌ای push شده، حتی اگر شاخه هنوز ادغام نشده، دیگر از نو ساخته یا ویرایش نمی‌شود؛ هر تغییر مدل
مهاجرت تازه می‌گیرد. پایگاهی که نسخه‌ی قبلی را اجرا کرده، آن مهاجرت را اجراشده می‌داند و نسخه‌ی تازه را هیچ‌وقت
اجرا نمی‌کند.

## تست‌ها

پایگاه داده باید بالا باشد (`docker compose up -d db`):

```bash
pipenv run pytest
```

## تنظیمات dev و prod

| فایل | چه زمانی | DEBUG |
|---|---|---|
| `config/settings/base.py` | تنظیمات مشترک | پیش‌فرض خاموش |
| `config/settings/dev.py` | `manage.py` و `pytest` روی سیستم توسعه | روشن |
| `config/settings/prod.py` | gunicorn و کانتینر Docker | خاموش |

برای انتخاب دستی، متغیر `DJANGO_SETTINGS_MODULE` را تنظیم کنید.

## ساختار پروژه

- `config/` تنظیمات و آدرس‌های اصلی
- `apps/` بخش‌های سامانه: `core`، `accounts`، `organization`، `workcalendar`، `audit`، `catalog`، `risks`، `actions`، `workflow`، `reports`
- `templates/` و `static/` قالب پایه، فونت وزیرمتن، Bootstrap راست‌چین و htmx
- `docker/nginx/` تنظیمات nginx
- `docs/` قواعد کسب‌وکار
