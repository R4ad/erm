# image Django برای محیط توسعه (docker-compose.dev.yml): فقط پایتون و بسته‌ها، با بسته‌های dev (pytest و ruff).
# خود کد از پوشه‌ی پروژه mount می‌شود و runserver با هر تغییر دوباره بار می‌شود؛ ساختن دوباره فقط وقتی لازم است که
# Pipfile.lock عوض شده باشد (docker compose up -d --build).
FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=config.settings.dev

WORKDIR /app

RUN pip install --no-cache-dir pipenv
COPY Pipfile Pipfile.lock ./
RUN pipenv install --deploy --system --dev

CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
