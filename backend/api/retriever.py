from sentence_transformers import SentenceTransformer, CrossEncoder
import faiss
import numpy as np

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

def build_index(docs):
    if not docs:
        return None, None
    model = get_embedding_model()
    embeddings = model.encode(docs)
    embeddings = np.array(embeddings).astype("float32")
    if len(embeddings.shape) == 1:
        embeddings = embeddings.reshape(1,-1)
    dimension = embeddings.shape[1]
    index = faiss.IndexFlatL2(dimension)
    index.add(embeddings)
    return index, embeddings

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
