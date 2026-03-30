"""Context compression for RAG chunks.

After retrieval and reranking, chunks may still contain sentences that are
irrelevant to the query. This module extracts only the query-relevant
sentences from each chunk, reducing prompt token waste.
"""

import re
import numpy as np


_SENTENCE_END_RE = re.compile(r"(?<=[.!?])\s+")

_ABBREVS = {"Mr.", "Mrs.", "Ms.", "Dr.", "Prof.", "Sr.", "Jr.", "vs.", "etc.", "e.g.", "i.e."}


def _split_sentences(text):
    """Split text into sentences, keeping non-empty results."""
    raw = _SENTENCE_END_RE.split(text.strip())
    merged = []
    for part in raw:
        part = part.strip()
        if not part:
            continue
        if merged and any(merged[-1].endswith(a) for a in _ABBREVS):
            merged[-1] = merged[-1] + " " + part
        else:
            merged.append(part)
    return merged


def _cosine_similarity(a, b):
    """Cosine similarity between two 1-D vectors."""
    dot = np.dot(a, b)
    norm = np.linalg.norm(a) * np.linalg.norm(b)
    return float(dot / norm) if norm > 0 else 0.0


def compress_chunks(query, chunks, model, min_similarity=0.3):
    """Compress chunks by keeping only query-relevant sentences.

    Args:
        query: The user's question.
        chunks: List of chunk strings (post-retrieval / post-rerank).
        model: A SentenceTransformer model (or anything with .encode()).
        min_similarity: Minimum cosine similarity for a sentence to be kept.

    Returns:
        A list of compressed chunk strings. Chunks that compress to empty
        are dropped entirely.
    """
    if not chunks:
        return []

    # Encode query once.
    query_emb = model.encode([query], show_progress_bar=False)
    query_vec = np.array(query_emb, dtype=np.float32).flatten()

    compressed = []
    for chunk in chunks:
        sentences = _split_sentences(chunk)

        # If the chunk is very short (1-2 sentences), keep it as-is
        # since there's nothing meaningful to compress.
        if len(sentences) <= 2:
            compressed.append(chunk)
            continue

        # Encode all sentences in the chunk.
        sent_embs = model.encode(sentences, show_progress_bar=False)
        sent_embs = np.array(sent_embs, dtype=np.float32)

        # Keep sentences above the similarity threshold.
        kept = []
        for j, sent in enumerate(sentences):
            sim = _cosine_similarity(query_vec, sent_embs[j])
            if sim >= min_similarity:
                kept.append(sent)

        # If compression removed everything, keep the top sentence by score.
        if not kept:
            scores = [
                _cosine_similarity(query_vec, sent_embs[j])
                for j in range(len(sentences))
            ]
            best_idx = int(np.argmax(scores))
            kept = [sentences[best_idx]]

        result = " ".join(kept).strip()
        if result:
            compressed.append(result)

    return compressed
