import importlib

from celery import shared_task
from django.db import close_old_connections
from django.utils import timezone

from api.models import Task


class TaskCancelled(Exception):
    pass


def submit_task(task_id, job_fn, *args, **kwargs):
    """Thin wrapper that keeps the same interface views already call.
    Converts the callable to a dotted path so Celery can serialize it."""
    fn_path = f"{job_fn.__module__}.{job_fn.__qualname__}"
    _run_task.delay(str(task_id), fn_path, args, kwargs)


@shared_task(ignore_result=True)
def _run_task(task_id, fn_path, args, kwargs):
    close_old_connections()
    try:
        task = Task.objects.get(id=task_id)
    except Task.DoesNotExist:
        return

    if task.status == "cancelled":
        task.finished_at = task.finished_at or timezone.now()
        task.save(update_fields=["finished_at", "updated_at"])
        return

    task.status = "processing"
    task.started_at = timezone.now()
    task.message = task.message or "Task started."
    task.save(update_fields=["status", "started_at", "message", "updated_at"])

    def is_cancelled():
        return Task.objects.filter(id=task_id, status="cancelled").exists()

    def update(progress=None, message=None):
        if is_cancelled():
            raise TaskCancelled("Task was cancelled.")
        updates = []
        if progress is not None:
            task.progress = max(0, min(100, int(progress)))
            updates.append("progress")
        if message is not None:
            task.message = message
            updates.append("message")
        if updates:
            task.save(update_fields=updates + ["updated_at"])

    # Resolve the job function from its dotted path
    module_path, fn_name = fn_path.rsplit(".", 1)
    module = importlib.import_module(module_path)
    job_fn = getattr(module, fn_name)

    try:
        result = job_fn(update=update, is_cancelled=is_cancelled, *args, **kwargs) or {}
        task.refresh_from_db()
        if task.status == "cancelled":
            task.finished_at = task.finished_at or timezone.now()
            task.save(update_fields=["finished_at", "updated_at"])
            return
        task.status = "completed"
        task.progress = 100
        task.result = result
        task.message = task.message or "Task completed."
        task.error = ""
        task.finished_at = timezone.now()
        task.save(
            update_fields=[
                "status",
                "progress",
                "result",
                "message",
                "error",
                "finished_at",
                "updated_at",
            ]
        )
    except TaskCancelled:
        task.refresh_from_db()
        task.status = "cancelled"
        task.finished_at = task.finished_at or timezone.now()
        task.save(update_fields=["status", "finished_at", "updated_at"])
    except Exception as exc:
        task.status = "failed"
        task.error = str(exc)
        task.finished_at = timezone.now()
        task.save(update_fields=["status", "error", "finished_at", "updated_at"])
    finally:
        close_old_connections()
