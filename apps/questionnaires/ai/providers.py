"""سرویس‌دهنده‌های LLM برای شناسایی هوشمند. هر سرویس‌دهنده complete(system, user, schema) دارد و متن خام پاسخ مدل را
برمی‌گرداند؛ اعتبارسنجی و تلاش دوباره کار pipeline است.

- mock (پیش‌فرض توسعه و تست): بدون شبکه، ریسک‌ها را مستقیم از متن گروه‌های ورودی می‌سازد.
- openai_compatible: سرورهای داخلی سازگار با OpenAI مثل vLLM یا Ollama، با urllib کتابخانه‌ی استاندارد. اول خروجی
  ساختاریافته با JSON Schema را می‌خواهد و اگر سرور نپذیرد به json_object برمی‌گردد.

تنظیمات از settings: LLM_PROVIDER، LLM_BASE_URL، LLM_MODEL، LLM_API_KEY و LLM_TIMEOUT_MS."""

import json
import urllib.error
import urllib.request

from django.conf import settings


class ProviderError(Exception):
    """شکست سرویس‌دهنده؛ status برای کد پیگیری است (۵۰۴ پایان مهلت، ۵۰۲ پاسخ نامعتبر یا خطای سرور)."""

    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


def _input_from(user_message):
    start = user_message.index("<questionnaire_response>") + len("<questionnaire_response>")
    end = user_message.index("</questionnaire_response>")
    return json.loads(user_message[start:end])


class MockProvider:
    name = "mock"
    model = "mock-v1"

    def complete(self, system, user, schema):
        payload = _input_from(user)
        category = payload["allowed_categories"][0] if payload["allowed_categories"] else ""
        risks = []
        for group in payload["risk_groups"]:
            paths = group["realization_paths"]
            event = group["target_event"]["text"]
            title = f"{event} بر اثر {paths[0]['text']}"
            risks.append(
                {
                    "impact_id": group["impact_id"],
                    "title": title[:120],
                    "initiating_factor": payload["initiating_factor_answer"] or paths[0]["text"],
                    "realization_paths": [{"path_id": path["path_id"], "text": path["text"]} for path in paths],
                    "target_event": dict(group["target_event"]),
                    "impact": dict(group["impact"]),
                    "category": category,
                    "confidence": "high" if payload["initiating_factor_answer"] else "medium",
                    "confidence_reason": "عامل، مسیر، رویداد و پیامد از پاسخ‌ها برداشته شده‌اند.",
                    "gaps": [],
                }
            )
        return json.dumps({"risks": risks, "follow_up_questions": []}, ensure_ascii=False)


class OpenAICompatibleProvider:
    name = "openai_compatible"

    def __init__(self):
        self.base_url = settings.LLM_BASE_URL.rstrip("/")
        self.model = settings.LLM_MODEL
        self.api_key = settings.LLM_API_KEY
        self.timeout = settings.LLM_TIMEOUT_MS / 1000

    def _post(self, body):
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        request = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=json.dumps(body, ensure_ascii=False).encode(),
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as answer:
                return json.loads(answer.read().decode())
        except urllib.error.HTTPError as error:
            raise ProviderError(f"سرور LLM خطای {error.code} داد.", status=502 if error.code < 500 else error.code)
        except TimeoutError:
            raise ProviderError("سرور LLM در مهلت پاسخ نداد.", status=504)
        except (urllib.error.URLError, ValueError) as error:
            raise ProviderError(f"سرور LLM در دسترس نیست: {error}", status=502)

    def complete(self, system, user, schema):
        if not self.base_url or not self.model:
            raise ProviderError("LLM_BASE_URL یا LLM_MODEL تنظیم نشده است.", status=500)
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        body = {"model": self.model, "messages": messages, "temperature": 0}
        structured = {"type": "json_schema", "json_schema": {"name": "risk_identification", "schema": schema}}
        try:
            data = self._post({**body, "response_format": structured})
        except ProviderError as error:
            # سروری که json_schema را نمی‌شناسد معمولاً ۴۰۰ می‌دهد؛ با json_object دوباره امتحان می‌شود.
            if error.status != 502:
                raise
            data = self._post({**body, "response_format": {"type": "json_object"}})
        try:
            return data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError):
            raise ProviderError("پاسخ سرور LLM شکل مورد انتظار را ندارد.", status=502)


def get_provider():
    if settings.LLM_PROVIDER == "openai_compatible":
        return OpenAICompatibleProvider()
    return MockProvider()
