import os
import google.generativeai as genai

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise ValueError("Set the GEMINI_API_KEY environment variable.")

genai.configure(api_key=api_key)

# model = genai.GenerativeModel("gemini-3.1-pro-preview")
model = genai.GenerativeModel("gemini-3-flash-preview")

def generate_answer(query, context_chunks):
    context = "\n\n".join([f"[{i+1}] {chunk}" for i, chunk in enumerate(context_chunks)])
    prompt = f""" Use only the context below to answer the question. The context contains the answer; extract and cite it. Cite sources as [1], [2], etc. If the context clearly contains the answer, you must provide it.

Context:
{context}

Question: {query}

Answer:"""
    response = model.generate_content(prompt)
    return response.text