from sentence_transformers import SentenceTransformer, CrossEncoder
import faiss
import numpy as np
from rank_bm25 import BM25Okapi

_model = None
_reranker = None


def get_embedding_model():
    global _model
    if _model is None:
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def get_reranker():
    global _reranker
    if _reranker is None:
        _reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
    return _reranker

def embed_texts(texts):
    """Embed chunk strings into a float32 (n, dim) array, or None when empty."""
    if not texts:
        return None
    model = get_embedding_model()
    embeddings = model.encode(texts, show_progress_bar=False)
    embeddings = np.array(embeddings).astype("float32")
    if len(embeddings.shape) == 1:
        embeddings = embeddings.reshape(1,-1)
    return embeddings


def build_index(docs):
    if not docs:
        return None, None
    embeddings = embed_texts(docs)
    dimension = embeddings.shape[1]
    index = faiss.IndexFlatL2(dimension)
    index.add(embeddings)
    return index, embeddings


def clone_index(index):
    """Return an independent copy of a FAISS index.

    faiss.clone_index copies the underlying vectors, so appending to the clone
    cannot change the caller's index.
    """
    return faiss.clone_index(index)


def extend_index(index, embeddings, new_embeddings):
    """Append new_embeddings to a clone of index and to a copy of embeddings.

    Returns (extended_index, combined_embeddings), or (None, None) when the
    inputs do not line up. The caller's index, embeddings array and their rows
    are read only, so requests already using them keep a consistent view.
    """
    if index is None or embeddings is None or new_embeddings is None:
        return None, None
    try:
        base = np.asarray(embeddings, dtype="float32")
        added = np.asarray(new_embeddings, dtype="float32")
        if added.ndim == 1:
            added = added.reshape(1, -1)
        if base.ndim != 2 or added.ndim != 2:
            return None, None
        if base.shape[1] != added.shape[1]:
            return None, None
        if int(index.ntotal) != base.shape[0] or int(index.d) != base.shape[1]:
            return None, None
        extended = clone_index(index)
        extended.add(np.ascontiguousarray(added))
        if int(extended.ntotal) != base.shape[0] + added.shape[0]:
            return None, None
        combined = np.concatenate([base, added], axis=0)
    except Exception:
        return None, None
    if int(combined.shape[0]) != int(extended.ntotal):
        return None, None
    return extended, combined

def search(query, docs, index, embeddings, top_k=3):
    if not docs or index is None or index.ntotal == 0:
        return [], []
    try:
        top_k = int(top_k)
    except (TypeError, ValueError):
        top_k = 3
    top_k = max(1, top_k)
    top_k = min(top_k, index.ntotal)
    model = get_embedding_model()
    query_vec = model.encode([query])
    query_vec = np.ascontiguousarray(
        np.array(query_vec, dtype=np.float32).flatten()[: index.d].reshape(1, index.d)
    )
    distances, indices = index.search(query_vec, top_k)
    safe_indices = [i for i in indices[0].tolist() if i >= 0]
    chunk_list = [docs[i] for i in safe_indices]
    return chunk_list, safe_indices

def rerank(query, chunks, top_k=3):
    if not chunks:
        return []
    try:
        top_k = int(top_k)
    except (TypeError, ValueError):
        top_k = 3
    top_k = max(1, top_k)
    reranker = get_reranker()
    pairs = [[query, chunk] for chunk in chunks]
    scores = reranker.predict(pairs)
    ranked_indices = np.argsort(scores)[::-1][:top_k]
    return [
        {
            "chunk": chunks[i],
            "score": float(scores[i]),
            "index": int(i),
        }
        for i in ranked_indices
    ]


def remove_overlapping_chunks(chunks, sources, overlap_threshold=0.6):
    """Remove chunks with high text overlap, keeping higher-ranked ones.

    After reranking, adjacent semantic chunks may share significant content
    (sentences at chunk boundaries). This wastes context window tokens and
    can lead to repetitive or lower-quality LLM answers.

    Uses Jaccard similarity on word sets — fast, no model calls needed.

    Args:
        chunks: List of chunk strings, ordered by relevance (best first).
        sources: Parallel list of source filenames.
        overlap_threshold: Jaccard similarity above which a chunk is dropped.

    Returns:
        Tuple of (deduplicated_chunks, deduplicated_sources).
    """
    if len(chunks) <= 1:
        return chunks, sources

    kept_chunks = [chunks[0]]
    kept_sources = [sources[0]]

    for i in range(1, len(chunks)):
        words_i = set(chunks[i].lower().split())
        is_overlapping = False
        for kept in kept_chunks:
            words_kept = set(kept.lower().split())
            if not words_i or not words_kept:
                continue
            intersection = len(words_i & words_kept)
            union = len(words_i | words_kept)
            jaccard = intersection / union if union > 0 else 0.0
            if jaccard >= overlap_threshold:
                is_overlapping = True
                break
        if not is_overlapping:
            kept_chunks.append(chunks[i])
            kept_sources.append(sources[i])

    return kept_chunks, kept_sources


def build_bm25_index(docs):
    tokenized_corpus = [doc.lower().split() for doc in docs]
    return BM25Okapi(tokenized_corpus), tokenized_corpus


def hybrid_search(query, docs, dense_index, bm25_index, tokenized_corpus, embeddings, top_k=10):
    if not docs:
        return [], []

    dense_chunks, dense_indices = search(query, docs, dense_index, embeddings, top_k=top_k)

    tokenized_query = query.lower().split()
    bm25_scores = bm25_index.get_scores(tokenized_query)
    bm25_indices = sorted(range(len(bm25_scores)), key=lambda i: bm25_scores[i], reverse=True)[:top_k]

    K = 60
    doc_scores = {}
    for rank, idx in enumerate(dense_indices):
        doc_scores[idx] = doc_scores.get(idx, 0) + 1 / (K + rank + 1)
    for rank, idx in enumerate(bm25_indices):
        doc_scores[idx] = doc_scores.get(idx, 0) + 1 / (K + rank + 1)

    fused_indices = sorted(doc_scores.keys(), key=lambda i: doc_scores[i], reverse=True)[:top_k]
    fused_chunks = [docs[i] for i in fused_indices]
    return fused_chunks, fused_indices
