"""Backfill Document rows from files on disk and sweep orphan rows.

Makes the Document table authoritative for the document catalog:
every supported file under documents/<user_id>/ gets a row, and rows
with no file on disk are removed. Runs once on migrate; later
mutations (upload, URL ingest, move, rename, delete) maintain rows.
"""
import os
from pathlib import Path

from django.db import migrations


SUPPORTED_EXTENSIONS = (".txt", ".md", ".pdf", ".docx")


def backfill_document_rows(apps, schema_editor):
    from django.conf import settings

    User = apps.get_model("auth", "User")
    Document = apps.get_model("api", "Document")
    doc_dir = os.path.join(settings.BASE_DIR, "documents")
    for user in User.objects.all().iterator():
        user_dir = os.path.join(doc_dir, str(user.id))
        if not os.path.isdir(user_dir):
            continue
        try:
            names = os.listdir(user_dir)
        except OSError:
            continue
        for name in names:
            if not name.lower().endswith(SUPPORTED_EXTENSIONS):
                continue
            if not os.path.isfile(os.path.join(user_dir, name)):
                continue
            Document.objects.get_or_create(user=user, filename=Path(name).name)
    for doc in Document.objects.all().iterator():
        path = os.path.join(doc_dir, str(doc.user_id), doc.filename)
        if not os.path.isfile(path):
            doc.delete()


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0014_alter_userprofile_llm_model"),
    ]

    operations = [
        migrations.RunPython(backfill_document_rows, noop_reverse),
    ]
