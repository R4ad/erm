import mimetypes
import os
from urllib.parse import quote

from django.conf import settings
from django.contrib import messages
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import PermissionDenied
from django.http import FileResponse, HttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.utils.functional import cached_property
from django.views.generic import FormView, ListView, UpdateView, View

from . import records
from .forms import AttachmentForm, CommentForm
from .models import Attachment, Comment


def home(request):
    return render(request, "core/home.html", {"now": timezone.now()})


class FilteredListView(ListView):
    """فهرست با فرم جست‌وجو و فیلتر و صفحه‌بندی. فرم فیلتر باید متد filter(queryset) داشته باشد."""

    filter_form_class = None
    paginate_by = 25

    def get_filter_data(self):
        """داده‌ی فرم فیلتر. فهرستی که فیلتر پیش‌فرض دارد این را بازنویسی می‌کند."""
        return self.request.GET

    def get_filter_form_kwargs(self):
        """آرگومان‌های بیشتر فرم فیلتر، مثلاً کاربر برای فیلدی که گزینه‌هایش به دسترسی او بسته است."""
        return {}

    def get_queryset(self):
        self.filter_form = self.filter_form_class(self.get_filter_data(), **self.get_filter_form_kwargs())
        queryset = super().get_queryset()
        if not self.filter_form.is_valid():
            return queryset.none()
        return self.filter_form.filter(queryset)

    def get_context_data(self, **kwargs):
        return super().get_context_data(filter_form=self.filter_form, **kwargs)


class FormPageMixin:
    """صفحه‌ی یکسان ساختن و ویرایش: عنوان از نام مدل و دکمه‌ی انصراف به success_url."""

    template_name = "form_page.html"

    def get_context_data(self, **kwargs):
        name = self.model._meta.verbose_name
        title = f"ویرایش {name}" if self.object else f"{name} جدید"
        return super().get_context_data(title=title, cancel_url=self.success_url, **kwargs)


class RecordMixin:
    """رکوردی که پیوست یا نظر به آن اضافه می‌شود، از نوع و شناسه‌ی نشانی؛ اگر کاربر نبیندش ۴۰۴."""

    @cached_property
    def record(self):
        content_type = get_object_or_404(ContentType, pk=self.kwargs["content_type"])
        return records.visible_record(self.request.user, content_type, self.kwargs["object_id"])


class AttachmentUploadView(RecordMixin, FormView):
    form_class = AttachmentForm
    template_name = "form_page.html"

    def dispatch(self, request, *args, **kwargs):
        if not records.can_attach(request.user, self.record):
            raise PermissionDenied
        return super().dispatch(request, *args, **kwargs)

    def form_valid(self, form):
        upload = form.cleaned_data["file"]
        attachment = Attachment(
            content_object=self.record,
            original_name=os.path.basename(upload.name)[:255],
            size=upload.size,
            description=form.cleaned_data["description"],
            created_by=self.request.user,
        )
        attachment.file.save(upload.name, upload, save=False)
        attachment.save()
        messages.success(self.request, f"فایل «{attachment.original_name}» پیوست شد.")
        return redirect(self.record.get_absolute_url() + "#attachments")

    def get_context_data(self, **kwargs):
        return super().get_context_data(
            title=f"پیوست تازه برای {self.record}",
            cancel_url=self.record.get_absolute_url(),
            multipart=True,
            **kwargs,
        )


def attachment_download(request, pk):
    """فایل پیوست، فقط برای کسی که رکورد اصلی را می‌بیند. روی سرور nginx فایل را می‌فرستد (X-Accel-Redirect)."""
    attachment = get_object_or_404(Attachment.objects.select_related("content_type"), pk=pk)
    records.visible_record(request.user, attachment.content_type, attachment.object_id)
    content_type = mimetypes.guess_type(attachment.original_name)[0] or "application/octet-stream"
    prefix = settings.ATTACHMENT_X_ACCEL_PREFIX
    if prefix:
        response = HttpResponse(content_type=content_type)
        response["X-Accel-Redirect"] = prefix + quote(attachment.file.name)
        response["Content-Disposition"] = f"attachment; filename*=UTF-8''{quote(attachment.original_name)}"
    else:
        response = FileResponse(
            attachment.file.open("rb"), as_attachment=True, filename=attachment.original_name, content_type=content_type
        )
    response["X-Content-Type-Options"] = "nosniff"
    return response


class CommentCreateView(RecordMixin, View):
    """نظر تازه از فرم پایین صفحه‌ی رکورد. هر کس رکورد را می‌بیند نظر می‌نویسد."""

    def post(self, request, *args, **kwargs):
        form = CommentForm(request.POST)
        if form.is_valid():
            Comment.objects.create(content_object=self.record, text=form.cleaned_data["text"], created_by=request.user)
            messages.success(request, "نظر ثبت شد.")
        else:
            messages.error(request, "نظر خالی ثبت نمی‌شود.")
        return redirect(self.record.get_absolute_url() + "#comments")


class CommentUpdateView(UpdateView):
    """ویرایش نظر، فقط به دست نویسنده‌اش و فقط وقتی هنوز رکورد را می‌بیند. متن قبلی در تاریخچه می‌ماند."""

    model = Comment
    fields = ["text"]
    template_name = "form_page.html"

    def get_object(self, queryset=None):
        comment = super().get_object(queryset)
        if comment.created_by_id != self.request.user.pk:
            raise PermissionDenied
        self.record = records.visible_record(self.request.user, comment.content_type, comment.object_id)
        return comment

    def get_form(self, form_class=None):
        form = super().get_form(form_class)
        form.fields["text"].widget.attrs.update(rows=4, **{"class": "form-control"})
        return form

    def form_valid(self, form):
        form.save()
        messages.success(self.request, "نظر ویرایش شد.")
        return redirect(self.record.get_absolute_url() + "#comments")

    def get_context_data(self, **kwargs):
        return super().get_context_data(
            title="ویرایش نظر", cancel_url=self.record.get_absolute_url() + "#comments", **kwargs
        )
