from .base import *

DEBUG = False

# پشت پروکسی HTTPS، مثل nginx پروژه‌ی دیگری روی همان سرور که TLS را تمام می‌کند (docker/behind-proxy.yml).
# Django از سرآیند X-Forwarded-Proto می‌فهمد درخواست HTTPS بوده؛ بدون آن، ورود با خطای CSRF رد می‌شود. فقط وقتی
# روشن شود که جز آن پروکسی کسی به nginx سامانه نمی‌رسد، وگرنه هر کسی با یک سرآیند خودش را HTTPS جا می‌زند.
if env.bool("BEHIND_HTTPS_PROXY", default=False):
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SESSION_COOKIE_SECURE = CSRF_COOKIE_SECURE = True

# نشانی‌هایی که فرم‌ها از آن‌ها فرستاده می‌شوند، با طرح: https://erm.example.local
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=[])
