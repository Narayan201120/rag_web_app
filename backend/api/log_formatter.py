"""JSON log formatter for structured logging in production.

Outputs logs as single-line JSON objects for easy parsing by log
aggregators (CloudWatch, Datadog, etc.).
"""

import json
import logging
import traceback
from datetime import datetime, timezone


class JSONFormatter(logging.Formatter):
    """Formats log records as JSON objects."""

    def format(self, record):
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Add module/function context.
        if record.module:
            log_entry["module"] = record.module
        if record.funcName and record.funcName != "<module>":
            log_entry["function"] = record.funcName

        # Add exception info if present.
        if record.exc_info and record.exc_info[1]:
            log_entry["exception"] = {
                "type": record.exc_info[0].__name__,
                "message": str(record.exc_info[1]),
                "traceback": traceback.format_exception(*record.exc_info),
            }

        # Add any extra fields passed via `extra={}`.
        for key in ("user", "endpoint", "method", "status_code", "duration_ms",
                     "ip", "request_id"):
            if hasattr(record, key):
                log_entry[key] = getattr(record, key)

        return json.dumps(log_entry, default=str)
