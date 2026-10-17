"""Semantic boundary chunking for RAG documents.

Instead of naive paragraph splitting (\\n\\n), groups consecutive sentences
into chunks based on embedding similarity. When similarity between adjacent
sentences drops below a threshold, a new chunk boundary is created.
"""

import re
import numpy as np

# Sentence splitting: split on whitespace that follows a sentence terminator,
# while protecting abbreviations, decimals, initials, ellipses and numbered
# list markers from being treated as boundaries.
_SENTENCE_END_RE = re.compile(r"(?<=[.!?])\s+")

# Common abbreviations that shouldn't trigger sentence splits.
_ABBREVS = {"Mr.", "Mrs.", "Ms.", "Dr.", "Prof.", "Sr.", "Jr.", "vs.", "etc.", "e.g.", "i.e."}


def _protect(text):
    """Replace periods that must not become split points with a placeholder."""
    protected = text
    # Ellipsis.
    protected = re.sub(r"\.{2,}", lambda m: m.group(0).replace(".", "\x00"), protected)
    # Decimals like 3.5.
    protected = re.sub(r"(?<=\d)\.(?=\d)", "\x00", protected)
    # Single-letter initials like "J. R. R. Tolkien".
    protected = re.sub(r"(?<![A-Za-z])([A-Z])\.", lambda m: m.group(1) + "\x00", protected)
    # Known abbreviations.
    for abbr in _ABBREVS:
        protected = protected.replace(abbr, abbr[:-1] + "\x00")
    # Numbered list / heading markers like "1. Introduction" or "## 2. Foo".
    protected = re.sub(r"(?m)(^\s*#{0,6}\s*\d+)\.\s", lambda m: m.group(1) + "\x00 ", protected)
    return protected


def _split_sentences(text):
    """Split text into sentences, keeping non-empty results."""
    if not text or not text.strip():
        return []

    protected = _protect(text.strip())
    raw = _SENTENCE_END_RE.split(protected)

    # Restore protected periods.
    restored = [part.replace("\x00", ".") for part in raw]

    # Rejoin fragments that were split after abbreviations / initials / decimals.
    merged = []
    for part in restored:
        part = part.strip()
        if not part:
            continue
        if merged and any(merged[-1].endswith(a) for a in _ABBREVS):
            merged[-1] = merged[-1] + " " + part
        elif merged and re.search(r"\b[A-Z]\.$", merged[-1]):
            merged[-1] = merged[-1] + " " + part
        elif merged and re.search(r"\d\.$", merged[-1]) and re.match(r"^\d", part):
            merged[-1] = merged[-1] + " " + part
        else:
            merged.append(part)
    return merged


def _cosine_similarity(a, b):
    """Cosine similarity between two 1-D vectors."""
    dot = np.dot(a, b)
    norm = np.linalg.norm(a) * np.linalg.norm(b)
    return float(dot / norm) if norm > 0 else 0.0


def semantic_chunk(text, model, max_chunk_chars=1500, similarity_threshold=0.05):
    """Split text into semantically coherent chunks.

    Args:
        text: The full document text.
        model: A SentenceTransformer model (or anything with .encode()).
        max_chunk_chars: Soft character limit per chunk.
        similarity_threshold: Minimum cosine similarity between consecutive
            sentences to keep them in the same chunk.

    Returns:
        A list of chunk strings.
    """
    if not text or not text.strip():
        return []

    sentences = _split_sentences(text)

    # If very few sentences, return as a single chunk.
    if len(sentences) <= 2:
        joined = " ".join(sentences)
        return [joined] if joined.strip() else []

    # Encode all sentences at once for efficiency.
    embeddings = model.encode(sentences, show_progress_bar=False)
    embeddings = np.array(embeddings, dtype=np.float32)

    # Group sentences into chunks based on similarity boundaries.
    chunks = []
    current_sentences = [sentences[0]]
    current_len = len(sentences[0])

    for i in range(1, len(sentences)):
        sim = _cosine_similarity(embeddings[i - 1], embeddings[i])
        sentence_len = len(sentences[i])

        # Start a new chunk if similarity drops or we hit the size limit.
        if sim < similarity_threshold or (current_len + 1 + sentence_len > max_chunk_chars):
            chunk_text = " ".join(current_sentences).strip()
            if chunk_text:
                chunks.append(chunk_text)
            current_sentences = [sentences[i]]
            current_len = sentence_len
        else:
            current_sentences.append(sentences[i])
            current_len += 1 + sentence_len

    # Don't forget the last chunk.
    if current_sentences:
        chunk_text = " ".join(current_sentences).strip()
        if chunk_text:
            chunks.append(chunk_text)

    return chunks