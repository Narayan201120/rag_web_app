import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

DEFAULT_API_KEY = os.getenv("GEMINI_API_KEY")

def generate_answer(query, context_chunks, api_key=None, chat_history=None):
    key = api_key or DEFAULT_API_KEY
    if not key:
        raise ValueError("No API key provided. Set your key in Settings or set GEMINI_API_KEY env variable.")

    genai.configure(api_key=key)
    model = genai.GenerativeModel("gemini-3-flash-preview")

    context = "\n\n".join([f"[{i+1}] {chunk}" for i, chunk in enumerate(context_chunks)])
    history_text = ""
    if chat_history:
        for msg in chat_history:
            history_text += f"User: {msg['question']}\nAssistant: {msg['answer']}\n\n"
    prompt = f""" Use only the context below to answer the question. The context contains the answer; extract and cite it. Cite sources as [1], [2], etc. If the context clearly contains the answer, you must provide it.

Context:
{context}

{f"Conversation History:{chr(10)}{history_text}" if history_text else ""}

Question: {query}

Answer:"""
    response = model.generate_content(prompt)
    return response.text