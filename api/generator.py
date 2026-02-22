import os
import google.generativeai as genai

DEFAULT_API_KEY = os.getenv("GEMINI_API_KEY")

def generate_answer(query, context_chunks, api_key=None):
    key = api_key or DEFAULT_API_KEY
    if not key:
        raise ValueError("No API key provided. Set your key in Settings or set GEMINI_API_KEY env variable.")

    genai.configure(api_key=key)
    model = genai.GenerativeModel("gemini-2.0-flash")

    context = "\n\n".join([f"[{i+1}] {chunk}" for i, chunk in enumerate(context_chunks)])
    prompt = f""" Use only the context below to answer the question. The context contains the answer; extract and cite it. Cite sources as [1], [2], etc. If the context clearly contains the answer, you must provide it.

Context:
{context}

Question: {query}

Answer:"""
    response = model.generate_content(prompt)
    return response.text