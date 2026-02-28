import os
import requests
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

try:
    from google import genai as google_genai
except ImportError:
    google_genai = None


class ProviderAPIError(Exception):
    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.status_code = status_code


def _build_prompt(query, context_chunks, chat_history=None):
    context = "\n\n".join([f"[{i+1}] {chunk}" for i, chunk in enumerate(context_chunks)])
    history_text = ""
    if chat_history:
        for msg in chat_history:
            history_text += f"User: {msg['question']}\nAssistant: {msg['answer']}\n\n"
    return f""" Use only the context below to answer the question. The context contains the answer; extract and cite it. Cite sources as [1], [2], etc. If the context clearly contains the answer, you must provide it.

Context:
{context}

{f"Conversation History:{chr(10)}{history_text}" if history_text else ""}

Question: {query}

Answer:"""


def _generate_with_openai_compatible(prompt, api_key, model, base_url, max_tokens=1200):
    client = OpenAI(api_key=api_key, base_url=base_url)
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=max_tokens,
    )
    text = response.choices[0].message.content if response.choices else ""
    if text:
        return text
    raise ProviderAPIError("Provider returned an empty response.", status_code=502)


def _generate_with_gemini(prompt, api_key, model):
    if google_genai is not None:
        try:
            client = google_genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model=model,
                contents=prompt,
            )
            text = getattr(response, "text", None)
            if text:
                return text
            raise ProviderAPIError("Gemini returned an empty response.", status_code=502)
        except Exception as e:
            raise ProviderAPIError(f"Google Gemini error: {e}", status_code=400)

    try:
        import google.generativeai as legacy_genai

        legacy_genai.configure(api_key=api_key)
        legacy_model = legacy_genai.GenerativeModel(model)
        response = legacy_model.generate_content(prompt)
        text = getattr(response, "text", None)
        if text:
            return text
        raise ProviderAPIError("Gemini returned an empty response.", status_code=502)
    except Exception as e:
        raise ProviderAPIError(f"Google Gemini error: {e}", status_code=400)


def _generate_with_anthropic(prompt, api_key, model, max_tokens=1200):
    url = os.getenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com/v1/messages")
    try:
        response = requests.post(
            url,
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": max_tokens,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=30,
        )
        if response.status_code >= 400:
            try:
                payload = response.json()
                message = payload.get("error", {}).get("message") or str(payload)
            except Exception:
                message = response.text
            raise ProviderAPIError(f"Anthropic error: {message}", status_code=response.status_code)
        payload = response.json()
        parts = payload.get("content", [])
        text_parts = [item.get("text", "") for item in parts if item.get("type") == "text"]
        text = "\n".join([p for p in text_parts if p]).strip()
        if text:
            return text
        raise ProviderAPIError("Anthropic returned an empty response.", status_code=502)
    except ProviderAPIError:
        raise
    except Exception as e:
        raise ProviderAPIError(f"Anthropic error: {e}", status_code=400)


def _generate_with_provider(provider, model, key, prompt, max_tokens=1200):
    try:
        if provider == "google-gemini":
            return _generate_with_gemini(prompt, key, model)
        if provider == "openai":
            return _generate_with_openai_compatible(
                prompt,
                key,
                model,
                os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
                max_tokens=max_tokens,
            )
        if provider == "mistral":
            return _generate_with_openai_compatible(
                prompt,
                key,
                model,
                os.getenv("MISTRAL_BASE_URL", "https://api.mistral.ai/v1"),
                max_tokens=max_tokens,
            )
        if provider == "xai":
            return _generate_with_openai_compatible(
                prompt,
                key,
                model,
                os.getenv("XAI_BASE_URL", "https://api.x.ai/v1"),
                max_tokens=max_tokens,
            )
        if provider == "qwen":
            return _generate_with_openai_compatible(
                prompt,
                key,
                model,
                os.getenv("QWEN_BASE_URL", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"),
                max_tokens=max_tokens,
            )
        if provider == "minimax":
            return _generate_with_openai_compatible(
                prompt,
                key,
                model,
                os.getenv("MINIMAX_BASE_URL", "https://api.minimax.io/v1"),
                max_tokens=max_tokens,
            )
        if provider == "meta-llama":
            return _generate_with_openai_compatible(
                prompt,
                key,
                model,
                os.getenv("LLAMA_BASE_URL", "https://api.llama.com/compat/v1"),
                max_tokens=max_tokens,
            )
        if provider == "anthropic":
            return _generate_with_anthropic(prompt, key, model, max_tokens=max_tokens)
        if provider == "other":
            return _generate_with_openai_compatible(
                prompt,
                key,
                model,
                os.getenv("OTHER_LLM_BASE_URL", "https://api.openai.com/v1"),
                max_tokens=max_tokens,
            )
        raise ValueError(f'Unknown provider "{provider}".')
    except ProviderAPIError:
        raise
    except Exception as e:
        raise ProviderAPIError(f"{provider} error: {e}", status_code=400)


def generate_answer(query, context_chunks, provider, model, api_key, chat_history=None):
    key = (api_key or "").strip()
    if not key:
        raise ValueError("No API key is configured. Please add your provider, model, and API key in Settings.")
    if not model:
        raise ValueError("No model is configured. Please select a model in Settings.")

    prompt = _build_prompt(query, context_chunks, chat_history=chat_history)
    return _generate_with_provider(provider, model, key, prompt, max_tokens=1200)


def test_provider_connection(provider, model, api_key):
    key = (api_key or "").strip()
    if not key:
        raise ValueError("No API key is configured. Please add your provider, model, and API key in Settings.")
    if not model:
        raise ValueError("No model is configured. Please select a model in Settings.")

    prompt = "Reply with one short line confirming connectivity."
    return _generate_with_provider(provider, model, key, prompt, max_tokens=64)
