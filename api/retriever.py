from sentence_transformers import SentenceTransformer, CrossEncoder
import faiss
import numpy as np

model = SentenceTransformer("all-MiniLM-L6-v2")

def build_index(docs):
    embeddings = model.encode(docs)
    embeddings = np.array(embeddings).astype("float32")
    if len(embeddings.shape) == 1:
        embeddings = embeddings.reshape(1,-1)
    dimension = embeddings.shape[1]
    index = faiss.IndexFlatL2(dimension)
    index.add(embeddings)
    return index, embeddings

def search(query, docs, index, embeddings, top_k=3):
    query_vec = model.encode([query])
    query_vec = np.ascontiguousarray(
        np.array(query_vec, dtype=np.float32).flatten()[: index.d].reshape(1, index.d)
    )
    distances, indices = index.search(query_vec, top_k)
    chunk_list = [docs[i] for i in indices[0]]
    return chunk_list, indices[0].tolist()

reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")

def rerank(query, chunks, top_k=3):
    pairs = [[query, chunk] for chunk in chunks]
    scores = reranker.predict(pairs)
    ranked = sorted(zip(chunks, scores), key=lambda x: x[1], reverse=True)
    return [(chunk, float(score)) for chunk, score in ranked[:top_k]]