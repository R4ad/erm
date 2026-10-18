from django.shortcuts import render
from django.utils import timezone


def home(request):
    return render(request, "core/home.html", {"now": timezone.now()})