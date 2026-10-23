"""Profile the local retrieval path without calling an LLM provider.

Run from the repository root:
    venv\\Scripts\\python.exe backend\\profile_retrieval.py --user-id 2

The profiler loads the selected user's local document index, warms model
inference once, then reports steady-state stage timings. It prints counts and
durations only; document text and query text are never included in its output.
"""

import argparse
import json
import os
import statistics
import threading
import time

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django

django.setup()

from django.contrib.auth import get_user_model

import api.views as views
from api.compressor import compress_chunks
from api.retriever import hybrid_search, rerank


def percentile(values, percentile_value):
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, int(round((len(ordered) - 1) * percentile_value))))
    return ordered[index]


def summarize(values):
    return {
        "median_ms": round(statistics.median(values) * 1000, 2),
        "p95_ms": round(percentile(values, 0.95) * 1000, 2),
    }


def _clear_index_cache():
    views._index_cache.clear()
    views._build_lock_entries.clear()


def _parallel_get_document_index(users):
    """Call get_document_index from one thread per user, all released together."""
    barrier = threading.Barrier(len(users))
    seen = []

    def worker(user):
        barrier.wait()
        seen.append((user.id, views.get_document_index(user)))

    threads = [threading.Thread(target=worker, args=(user,)) for user in users]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    return seen


def run_concurrency(user, other_user, threads):
    """Prove that concurrent first requests build once and stay user-scoped."""
    counter = {"builds": 0}
    original_loader = views.load_documents

    def counting_loader(load_user, progress_callback=None, is_cancelled=None):
        counter["builds"] += 1
        return original_loader(
            load_user,
            progress_callback=progress_callback,
            is_cancelled=is_cancelled,
        )

    views.load_documents = counting_loader
    try:
        _clear_index_cache()
        counter["builds"] = 0
        started = time.perf_counter()
        seen = _parallel_get_document_index([user] * threads)
        same_user = {
            "threads": threads,
            "builds": counter["builds"],
            "wall_ms": round((time.perf_counter() - started) * 1000, 2),
            "distinct_states": len({id(state) for _, state in seen}),
            "all_match_user": all(state.user_id == user.id for _, state in seen),
        }

        two_users = None
        if other_user is not None:
            pair = threads if threads % 2 == 0 else threads + 1
            _clear_index_cache()
            counter["builds"] = 0
            started = time.perf_counter()
            seen = _parallel_get_document_index([user, other_user] * (pair // 2))
            two_users = {
                "threads": pair,
                "builds": counter["builds"],
                "wall_ms": round((time.perf_counter() - started) * 1000, 2),
                "distinct_states": len({id(state) for _, state in seen}),
                "all_match_user": all(state.user_id == requested_id for requested_id, state in seen),
            }
        return {"same_user": same_user, "two_users": two_users}
    finally:
        views.load_documents = original_loader
        _clear_index_cache()


def run(question, user_id, iterations, switch_user_id=None, concurrency=None):
    user = get_user_model().objects.get(pk=user_id)

    index_started = time.perf_counter()
    document_index = views.get_document_index(user)
    index_load_seconds = time.perf_counter() - index_started

    if document_index.index is None or document_index.index.ntotal == 0:
        raise SystemExit("The selected user has no indexed document chunks.")

    user_switch_timings = None
    if switch_user_id is not None:
        other_user = get_user_model().objects.get(pk=switch_user_id)
        started = time.perf_counter()
        views.get_document_index(other_user)
        switched_seconds = time.perf_counter() - started

        started = time.perf_counter()
        document_index = views.get_document_index(user)
        returned_seconds = time.perf_counter() - started
        user_switch_timings = {
            "other_user_load_ms": round(switched_seconds * 1000, 2),
            "return_to_original_ms": round(returned_seconds * 1000, 2),
        }

    model = views.get_embedding_model()
    warmup_started = time.perf_counter()
    chunks, indices = hybrid_search(
        question,
        document_index.docs,
        document_index.index,
        document_index.bm25_index,
        document_index.bm25_tokenized,
        document_index.embeddings,
        top_k=10,
    )
    ranked = rerank(question, chunks, top_k=3)
    compress_chunks(question, [item["chunk"] for item in ranked], model)
    warmup_seconds = time.perf_counter() - warmup_started

    stage_samples = {
        "hybrid_search": [],
        "rerank": [],
        "compression": [],
        "local_retrieval_total": [],
    }

    for _ in range(iterations):
        total_started = time.perf_counter()

        started = time.perf_counter()
        chunks, indices = hybrid_search(
            question,
            document_index.docs,
            document_index.index,
            document_index.bm25_index,
            document_index.bm25_tokenized,
            document_index.embeddings,
            top_k=10,
        )
        stage_samples["hybrid_search"].append(time.perf_counter() - started)

        started = time.perf_counter()
        ranked = rerank(question, chunks, top_k=3)
        ranked_chunks = [item["chunk"] for item in ranked]
        stage_samples["rerank"].append(time.perf_counter() - started)

        started = time.perf_counter()
        compress_chunks(question, ranked_chunks, model)
        stage_samples["compression"].append(time.perf_counter() - started)
        stage_samples["local_retrieval_total"].append(time.perf_counter() - total_started)

    concurrency_result = None
    if concurrency:
        other_user = None
        if switch_user_id is not None:
            other_user = get_user_model().objects.get(pk=switch_user_id)
        concurrency_result = run_concurrency(user, other_user, concurrency)

    return {
        "user_id": user_id,
        "document_count": len(set(document_index.chunk_sources)),
        "chunk_count": len(document_index.docs),
        "iterations": iterations,
        "index_load_ms": round(index_load_seconds * 1000, 2),
        "warmup_ms": round(warmup_seconds * 1000, 2),
        "user_switch_timings": user_switch_timings,
        "concurrency": concurrency_result,
        "steady_state": {name: summarize(values) for name, values in stage_samples.items()},
        "includes_llm_generation": False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--user-id", type=int, required=True, help="Local Django user ID")
    parser.add_argument(
        "--question",
        default="Summarize the key information in these documents.",
        help="Question to use for retrieval timing (not sent to an LLM)",
    )
    parser.add_argument("--iterations", type=int, default=8)
    parser.add_argument(
        "--switch-user-id",
        type=int,
        help="Optionally load a second user and then time returning to the first user's cache",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=0,
        help="Run N concurrent first-request loads and report how many builds they caused",
    )
    args = parser.parse_args()
    if args.iterations < 1:
        parser.error("--iterations must be at least 1")
    if args.concurrency < 0:
        parser.error("--concurrency must be zero or greater")

    if args.switch_user_id == args.user_id:
        parser.error("--switch-user-id must be a different user")
    print(
        json.dumps(
            run(
                args.question,
                args.user_id,
                args.iterations,
                args.switch_user_id,
                args.concurrency,
            ),
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
