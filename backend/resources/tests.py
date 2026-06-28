import tempfile

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from resources.models import ResourceDocument

User = get_user_model()


@override_settings(PRIVATE_MEDIA_ROOT=tempfile.mkdtemp(prefix="chirin-resource-tests-"))
class ResourceDocumentApiTests(TestCase):
    def setUp(self):
        self.admin_group = Group.objects.create(name="Admin")
        self.admin = User.objects.create_user(username="admin", password="testpass123")
        self.admin.groups.add(self.admin_group)
        self.reviewer_group = Group.objects.create(name="Reviewer")
        self.reviewer = User.objects.create_user(username="reviewer", password="testpass123")
        self.reviewer.groups.add(self.reviewer_group)
        self.contributor = User.objects.create_user(username="contributor", password="testpass123")

    def _resource(self, title, visibility=ResourceDocument.Visibility.PUBLIC, filename="guide.pdf"):
        return ResourceDocument.objects.create(
            title=title,
            description="Reference guide",
            category="Orthography",
            visibility=visibility,
            file=SimpleUploadedFile(filename, b"%PDF-1.4 sample", content_type="application/pdf"),
        )

    def test_all_stewards_resources_list_and_download_for_signed_in_user(self):
        resource = self._resource("Ortograpiya Ivatan")
        self.client.login(username="contributor", password="testpass123")

        response = self.client.get("/api/resources")
        self.assertEqual(response.status_code, 200)
        rows = response.json()["rows"]
        self.assertEqual(rows[0]["title"], "Ortograpiya Ivatan")
        self.assertEqual(rows[0]["download_url"], f"/api/resources/{resource.slug}/download")

        download = self.client.get(rows[0]["download_url"])
        self.assertEqual(download.status_code, 200)
        self.assertEqual(download["Content-Type"], "application/pdf")
        self.assertIn("inline", download["Content-Disposition"])

    def test_all_stewards_resource_is_hidden_from_anonymous_users(self):
        resource = self._resource("Ortograpiya Ivatan")

        response = self.client.get("/api/resources")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["rows"], [])

        download = self.client.get(f"/api/resources/{resource.slug}/download")
        self.assertEqual(download.status_code, 404)

    def test_admin_resource_is_hidden_from_anonymous_users(self):
        resource = self._resource("Reviewer Slides", visibility=ResourceDocument.Visibility.ADMIN)

        response = self.client.get("/api/resources")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["rows"], [])

        download = self.client.get(f"/api/resources/{resource.slug}/download")
        self.assertEqual(download.status_code, 404)

    def test_privileged_user_can_open_admin_resource(self):
        resource = self._resource("Reviewer Slides", visibility=ResourceDocument.Visibility.ADMIN)
        self.client.login(username="reviewer", password="testpass123")

        response = self.client.get("/api/resources")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["rows"][0]["title"], "Reviewer Slides")

        download = self.client.get(f"/api/resources/{resource.slug}/download")
        self.assertEqual(download.status_code, 200)

    def test_rejects_unsupported_file_types(self):
        resource = ResourceDocument(
            title="Unsafe Upload",
            file=SimpleUploadedFile("payload.exe", b"not allowed"),
        )

        with self.assertRaises(ValidationError):
            resource.full_clean()

    def test_admin_can_create_update_and_delete_resource(self):
        self.client.login(username="admin", password="testpass123")

        create_response = self.client.post(
            "/api/admin/resources",
            data={
                "title": "Ortograpiya Ivatan",
                "description": "Writing guide",
                "category": "Language Guides",
                "visibility": ResourceDocument.Visibility.PUBLIC,
                "is_published": "true",
                "file": SimpleUploadedFile(
                    "ortograpiya.pdf",
                    b"%PDF-1.4 guide",
                    content_type="application/pdf",
                ),
            },
        )
        self.assertEqual(create_response.status_code, 201)
        resource_id = create_response.json()["resource"]["id"]

        update_response = self.client.post(
            f"/api/admin/resources/{resource_id}",
            data={
                "title": "Ortograpiya Ivatan Reference",
                "description": "Updated writing guide",
                "category": "Language Guides",
                "visibility": ResourceDocument.Visibility.MEMBERS,
                "is_published": "false",
            },
        )
        self.assertEqual(update_response.status_code, 200)
        payload = update_response.json()["resource"]
        self.assertEqual(payload["title"], "Ortograpiya Ivatan Reference")
        self.assertEqual(payload["visibility"], ResourceDocument.Visibility.MEMBERS)
        self.assertFalse(payload["is_published"])

        list_response = self.client.get("/api/admin/resources")
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(len(list_response.json()["rows"]), 1)

        delete_response = self.client.delete(f"/api/admin/resources/{resource_id}")
        self.assertEqual(delete_response.status_code, 200)
        self.assertFalse(ResourceDocument.objects.exists())

    def test_non_admin_cannot_manage_resources(self):
        self.client.login(username="reviewer", password="testpass123")

        response = self.client.get("/api/admin/resources")
        self.assertEqual(response.status_code, 403)
