from functools import wraps

from django.core.exceptions import PermissionDenied

def role_required(*roles):

    def decorator(view_func):
        @wraps(view_func)
        def wrapper(request, *args, **kwargs):
            user = request.user
            if user.is_system_admin or user.has_role(*roles):
                return view_func(request, *args, **kwargs)
            raise PermissionDenied

        return wrapper

    return decorator

class RoleRequiredMixin:

    roles = ()

    def dispatch(self, request, *args, **kwargs):
        user = request.user
        if user.is_system_admin or user.has_role(*self.roles):
            return super().dispatch(request, *args, **kwargs)
        raise PermissionDenied