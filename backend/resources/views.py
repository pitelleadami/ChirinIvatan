import mimetypes
import os

from django.core.exceptions import ValidationError
from django.http import FileResponse, Http404, JsonResponse
from django.views.decorators.http import require_GET, require_http_methods

from resources.models import ResourceDocument

PRIVILEGED_GROUPS = ["Admin", "Reviewer", "Consultant"]


def _is_admin(user):
    if not user.is_authenticated:
        return False
    return user.is_superuser or user.groups.filter(name="Admin").exists()


def _can_view(resource, user):
    if not user.is_authenticated:
        return False
    visibility = resource.visibility
    if visibility == ResourceDocument.Visibility.PUBLIC:
        return True
    if visibility == ResourceDocument.Visibility.MEMBERS:
        return True
    if user.is_superuser:
        return True
    return user.groups.filter(name__in=PRIVILEGED_GROUPS).exists()


def _resource_payload(resource):
    return {
        "id": str(resource.id),
        "title": resource.title,
        "slug": resource.slug,
        "description": resource.description,
        "category": resource.category or "General",
        "visibility": resource.visibility,
        "download_url": f"/api/resources/{resource.slug}/download",
        "filename": os.path.basename(resource.file.name) if resource.file else "",
        "is_published": resource.is_published,
        "updated_at": resource.updated_at.isoformat(),
    }


@require_GET
def resources_list_view(request):
    rows = []
    for resource in ResourceDocument.objects.filter(is_published=True):
        if not _can_view(resource, request.user):
            continue
        rows.append(_resource_payload(resource))
    return JsonResponse({"rows": rows})


@require_GET
def resource_download_view(request, slug):
    try:
        resource = ResourceDocument.objects.get(slug=slug, is_published=True)
    except ResourceDocument.DoesNotExist:
        raise Http404("Resource not found.")

    if not _can_view(resource, request.user) or not resource.file:
        raise Http404("Resource not found.")

    content_type, _ = mimetypes.guess_type(resource.file.name)
    response = FileResponse(
        resource.file.open("rb"),
        content_type=content_type or "application/octet-stream",
    )
    filename = os.path.basename(resource.file.name)
    response["Content-Disposition"] = f'inline; filename="{filename}"'
    return response


def _resource_from_form(resource, request):
    resource.title = request.POST.get("title", "").strip()
    resource.description = request.POST.get("description", "").strip()
    resource.category = request.POST.get("category", "").strip()
    resource.visibility = request.POST.get("visibility", ResourceDocument.Visibility.PUBLIC)
    resource.is_published = request.POST.get("is_published", "true") == "true"
    if "file" in request.FILES:
        resource.file = request.FILES["file"]
    if not resource.uploaded_by_id:
        resource.uploaded_by = request.user
    return resource


@require_http_methods(["GET", "POST"])
def admin_resources_view(request):
    if not _is_admin(request.user):
        return JsonResponse({"detail": "Admin access is required."}, status=403)

    if request.method == "GET":
        rows = [_resource_payload(resource) for resource in ResourceDocument.objects.all()]
        return JsonResponse({"rows": rows})

    resource = _resource_from_form(ResourceDocument(), request)
    if not resource.title:
        return JsonResponse({"detail": "Title is required."}, status=400)
    if not resource.file:
        return JsonResponse({"detail": "File is required."}, status=400)
    try:
        resource.full_clean()
    except ValidationError as exc:
        return JsonResponse({"detail": "; ".join(exc.messages)}, status=400)
    resource.save()
    return JsonResponse({"resource": _resource_payload(resource)}, status=201)


@require_http_methods(["POST", "DELETE"])
def admin_resource_detail_view(request, resource_id):
    if not _is_admin(request.user):
        return JsonResponse({"detail": "Admin access is required."}, status=403)

    try:
        resource = ResourceDocument.objects.get(id=resource_id)
    except ResourceDocument.DoesNotExist:
        raise Http404("Resource not found.")

    if request.method == "DELETE":
        stored_file = resource.file
        resource.delete()
        if stored_file:
            stored_file.delete(save=False)
        return JsonResponse({"ok": True})

    previous_file = resource.file
    previous_file_name = previous_file.name if previous_file else ""
    resource = _resource_from_form(resource, request)
    if not resource.title:
        return JsonResponse({"detail": "Title is required."}, status=400)
    try:
        resource.full_clean()
    except ValidationError as exc:
        return JsonResponse({"detail": "; ".join(exc.messages)}, status=400)
    resource.save()
    if "file" in request.FILES and previous_file and previous_file_name != resource.file.name:
        previous_file.storage.delete(previous_file_name)
    return JsonResponse({"resource": _resource_payload(resource)})
