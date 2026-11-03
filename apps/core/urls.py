from django.urls import path

from . import views

app_name = "core"

urlpatterns = [
    path("", views.home, name="home"),
    path(
        "attachments/<int:content_type>/<int:object_id>/new/",
        views.AttachmentUploadView.as_view(),
        name="attachment_upload",
    ),
    path("attachments/<int:pk>/", views.attachment_download, name="attachment_download"),
    path("comments/<int:content_type>/<int:object_id>/new/", views.CommentCreateView.as_view(), name="comment_create"),
    path("comments/<int:pk>/edit/", views.CommentUpdateView.as_view(), name="comment_update"),
]
