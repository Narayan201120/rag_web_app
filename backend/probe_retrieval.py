"""Measure retrieval quality and index shape against the sample corpus.

Run from backend/ with the project virtualenv:

    ..\\venv\\Scripts\\python.exe probe_retrieval.py

It answers a fixed question set and reports, per question, how many characters
of context reach the model and whether the expected source document was
actually retrieved. It also reports the chunk-size distribution and the time to
embed and index.

The questions and the expected documents are frozen so numbers stay comparable
across changes. Baseline recorded 2026-10-18, after the chunker stopped
emitting sentence fragments and its similarity threshold moved to 0.05:

    chunks                 64
    mean chunk chars       860.5
    median chunk chars     865
    under 150 chars        8 (12.5%)
    embed+index seconds    2.4-2.7
    expected doc retrieved 8/8
    median context chars   3540

Before that fix the same probe reported 604 chunks, a median chunk of 24
characters, 87.3% of chunks under 150 characters, and a median context of 505
characters. A change that drops retrieval below 8/8, or pushes median context
back toward a few hundred characters, is a regression.
"""

import os
import statistics
import sys
import time

BACKEND = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BACKEND)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import logging  # noqa: E402

logging.disable(logging.INFO)

import django  # noqa: E402

django.setup()

from api import views  # noqa: E402
from api.chunker import semantic_chunk  # noqa: E402
from api.retriever import (  # noqa: E402
    build_bm25_index,
    build_index,
    get_embedding_model,
    hybrid_search,
    rerank,
)

USER_ID = 2
TOP_K = 10
FINAL_K = 3

# (question, document that must appear among the retrieved sources)
QUESTIONS = [
    ("What does Bayes' theorem calculate?", "Bayes'_theorem.md"),
    ("What does the theorem say about conditional probability?", "Bayes'_theorem.md"),
    ("What is a neural network made of?", "neural_network.txt"),
    ("Which activation functions does the network use?", "neural_network.txt"),
    ("What problem does an SVM solve?", "support-vector-machine-algorithm.md"),
    ("What is the role of the kernel function?", "support-vector-machine-algorithm.md"),
    ("How does the algorithm choose a separating hyperplane?", "support-vector-machine-algorithm.md"),
    ("Why are the feature dimensions standardized?", "support-vector-machine-algorithm.md"),
]

PASS_THRESHOLD_CHUNKS = 120
MIN_MEDIAN_CHUNK_CHARS = 300
MIN_MEDIAN_CONTEXT_CHARS = 1200


def build_state():
    """Chunk the sample documents and build both indexes."""
    user_dir = views._user_doc_dir_from_id(USER_ID)
    files = views._list_document_files(user_dir)
    if not files:
        raise SystemExit(f"no documents found in {user_dir}")

    model = get_embedding_model()
    docs, sources = [], []
    for name in files:
        text = views.extract_text_from_file(os.path.join(user_dir, name), name)
        for chunk in semantic_chunk(text, model):
            docs.append(chunk)
            sources.append(name)

    started = time.perf_counter()
    index, embeddings = build_index(docs)
    bm25_index, bm25_tokenized = build_bm25_index(docs)
    embed_seconds = time.perf_counter() - started
    return docs, sources, index, embeddings, bm25_index, bm25_tokenized, embed_seconds


def main():
    documents = views._list_document_files(views._user_doc_dir_from_id(USER_ID))
    print(f"building index for user {USER_ID} over {len(documents)} documents ...")
    (
        docs,
        sources,
        index,
        embeddings,
        bm25_index,
        bm25_tokenized,
        embed_seconds,
    ) = build_state()

    sizes = sorted(len(d) for d in docs)
    print("=== chunking ===")
    print(f"chunks               : {len(docs)}")
    print(f"total chunk chars    : {sum(sizes)}")
    print(f"mean chunk chars     : {statistics.mean(sizes):.1f}")
    print(f"median chunk chars   : {statistics.median(sizes):.0f}")
    print(f"under 150 chars      : {sum(1 for s in sizes if s < 150)} "
          f"({sum(1 for s in sizes if s < 150) / len(sizes) * 100:.1f}%)")
    print(f"under 300 chars      : {sum(1 for s in sizes if s < 300)} "
          f"({sum(1 for s in sizes if s < 300) / len(sizes) * 100:.1f}%)")
    print(f"embed+index seconds  : {embed_seconds:.2f}")

    print("=== retrieval (per question) ===")
    print(f"{'question':<50} {'ctx_chars':>10}  hit")
    print("-" * 67)
    contexts, hits = [], 0
    for question, expected in QUESTIONS:
        chunks, fused = hybrid_search(
            question, docs, index, bm25_index, bm25_tokenized, embeddings, top_k=TOP_K
        )
        ranked = rerank(question, chunks, top_k=FINAL_K)
        if ranked:
            chosen = [r["chunk"] for r in ranked]
            # rerank reports a position inside the candidate list it was given,
            # so map back through the fused corpus indices.
            found = {sources[fused[r["index"]]] for r in ranked if 0 <= r["index"] < len(fused)}
        else:
            chosen = chunks[:FINAL_K]
            found = {sources[i] for i in fused[:FINAL_K]}
        contexts.append(sum(len(c) for c in chosen))
        if expected in found:
            hits += 1
        hit_label = "yes" if expected in found else "NO"
        print(f"{question[:50]:<50} {contexts[-1]:>10}  {hit_label}")

    median_context = statistics.median(contexts)
    print("-" * 67)
    print(f"median ctx chars     : {median_context:.0f}")
    print(f"mean ctx chars       : {statistics.mean(contexts):.0f}")
    print(f"expected doc retrieved: {hits}/{len(QUESTIONS)}")

    print("=== verdict (baseline 64 chunks, median chunk 865, median ctx 3540, 8/8) ===")
    checks = [
        ("retrieved every expected document", hits == len(QUESTIONS)),
        ("chunk count not back in the hundreds", len(docs) < PASS_THRESHOLD_CHUNKS),
        (
            "median chunk is a passage, not a fragment",
            statistics.median(sizes) >= MIN_MEDIAN_CHUNK_CHARS,
        ),
        (
            "median context is usable",
            median_context >= MIN_MEDIAN_CONTEXT_CHARS,
        ),
    ]
    for label, ok in checks:
        print(f"  [{'PASS' if ok else 'FAIL'}] {label}")
    print("all checks passed:", all(ok for _, ok in checks))
    return 0 if all(ok for _, ok in checks) else 1


if __name__ == "__main__":
    sys.exit(main())
