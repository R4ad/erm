"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),
    path("accounts/", include("apps.accounts.urls")),
    path("units/", include("apps.organization.urls")),
    path("holidays/", include("apps.workcalendar.urls")),
    path("audit/", include("apps.audit.urls")),
    path("catalog/", include("apps.catalog.urls")),
    path("method/", include("apps.methodology.urls")),
    path("", include("apps.core.urls")),
]

handler403 = "apps.audit.views.permission_denied"