"""Local Flask API for the TradeLab tutor and frontend assets."""

import json
import mimetypes
import re
from pathlib import Path, PurePosixPath

import requests
from flask import Flask, Response, jsonify, request, send_from_directory, stream_with_context

from backend.knowledge_base import (
    KnowledgeBaseError,
    INDEX_PATH,
    build_retrieval_context,
    retrieve_relevant,
    tokenize,
)


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SYSTEM_PROMPT_PATH = PROJECT_ROOT / "ai_system_prompt.txt"
LLAMA_URL = "http://127.0.0.1:8080/v1/chat/completions"
MODEL_LABEL = "Qwen3-8B Q4_K_M"
MAX_MESSAGE_LENGTH = 1000
MAX_ASSISTANT_MESSAGE_LENGTH = 4000
MAX_MESSAGES = 12
MAX_HISTORY_CHARS = 2500
# Long enough for normal educational answers with tables and examples, while
# staying comfortably inside common local Qwen context windows with the bounded
# history and retrieval context above.
MAX_COMPLETION_TOKENS = 900
TOKEN_LIMIT_FINISH_REASONS = {"length", "max_tokens", "max_completion_tokens"}
NO_EVIDENCE_GUIDANCE = (
    "No relevant passages were retrieved from the local knowledge library for this turn. Use the full user and "
    "assistant conversation to understand follow-ups such as yes, no, why, or tell me more, and answer the current "
    "request directly. You may explain stable, general financial-education concepts from general knowledge, but "
    "make clear when an answer is not verified by the local library. Never claim to have consulted a source or "
    "invent a citation. Do not guess current prices, news, platform features, fees, regulations, or other details "
    "that require current or source-specific verification. For platform comparisons, give only general criteria "
    "as questions to verify using each provider's official information (fees, available investments, practice "
    "tools, education, security, and support). Do not say that some, most, or any provider offers a feature, fee "
    "structure, or service without direct evidence. Explain the limitation and ask a focused clarification when "
    "needed. Follow the tutor's educational and financial-safety rules."
)
GREETING_REPLIES = {
    "hello": "Hello! I'm TradeLab's AI tutor. What financial concept would you like to learn about?",
    "hi": "Hi! I'm TradeLab's AI tutor. What financial concept would you like to learn about?",
    "hey": "Hey! I'm TradeLab's AI tutor. What financial concept would you like to learn about?",
    "good morning": "Good morning! I'm TradeLab's AI tutor. What financial concept would you like to learn about?",
    "good afternoon": "Good afternoon! I'm TradeLab's AI tutor. What financial concept would you like to learn about?",
    "good evening": "Good evening! I'm TradeLab's AI tutor. What financial concept would you like to learn about?",
    "how are you": "I'm ready to help you learn. I'm TradeLab's AI tutor. What would you like to explore?",
    "hello how are you": "I'm ready to help you learn. I'm TradeLab's AI tutor. What would you like to explore?",
    "hi how are you": "I'm ready to help you learn. I'm TradeLab's AI tutor. What would you like to explore?",
}
IDENTITY_QUESTIONS = {
    "who are you",
    "what are you",
    "what is your name",
    "whats your name",
    "what s your name",
    "are you an ai",
    "are you a bot",
    "introduce yourself",
    "what can you help me with",
    "what can you help with",
}
LEVEL_GUIDANCE = {
    "beginner": "Define new terms, use plain language, and show simple examples.",
    "intermediate": "Assume familiarity with basic market concepts and explain useful details.",
    "advanced": "Be concise and precise; include formulas and important caveats when useful.",
}
FOLLOW_UP_GENERIC_TERMS = {
    "financial",
    "finance",
    "investment",
    "investments",
    "investment",
    "investments",
    "beginner",
    "beginners",
    "learn",
    "learning",
    "like",
    "general",
    "help",
    "explain",
    "compare",
    "choosing",
    "choose",
    "features",
    "criteria",
    "question",
    "questions",
    "one",
}

mimetypes.add_type("text/javascript", ".js")

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024


@app.after_request
def ensure_api_utf8_charset(response):
    if response.mimetype in {"application/json", "text/event-stream"}:
        response.headers["Content-Type"] = f"{response.mimetype}; charset=utf-8"
    return response


def bounded_history(messages):
    """Keep recent turns ordered within budget, trimming older content before recent context."""
    selected = []
    remaining = MAX_HISTORY_CHARS
    for message in reversed(messages[-MAX_MESSAGES:]):
        if remaining <= 0:
            break
        content = message["content"]
        if len(content) > remaining:
            marker = "[Earlier part of this message omitted]\n"
            suffix_length = max(0, remaining - len(marker))
            content = marker[:remaining] + (content[-suffix_length:] if suffix_length else "")
        selected.append({"role": message["role"], "content": content})
        remaining -= len(content)
    return list(reversed(selected))


def retrieval_query_for_history(messages):
    if not is_contextual_follow_up(messages[-1]["content"]):
        return messages[-1]["content"].strip()
    recent_context = messages[-5:]
    return "\n".join(f"{message['role']}: {message['content']}" for message in recent_context)


def is_contextual_follow_up(content):
    current = content.strip()
    words = re.findall(r"\b[\w']+\b", current.casefold())
    normalized = " ".join(words)
    short_references = {"yes", "no", "why", "how", "more", "example", "another", "again", "which", "that", "it"}
    return normalized in short_references or bool(
        re.match(
            r"^(?:what about|which(?: one| option| of those)?|another(?: one| option)?|more|why|how|"
            r"explain that|can you (?:explain that|give me|tell me more)|could you (?:explain that|give me|"
            r"tell me more)|tell me more)\b",
            normalized,
        )
    )


def filter_contextual_passages(messages, passages):
    """Discard keyword-only matches that do not address a short follow-up's topic."""
    if len(messages) < 2 or not passages or not is_contextual_follow_up(messages[-1]["content"]):
        return passages

    anchors = set()
    for message in messages[-3:-1]:
        anchors.update(tokenize(message["content"]))
    anchors.difference_update(FOLLOW_UP_GENERIC_TERMS)
    if not anchors:
        return passages

    relevant = []
    for passage in passages:
        metadata = passage.get("metadata", {})
        passage_terms = set(
            re.findall(
                r"\b[a-z0-9]+\b",
                " ".join((passage.get("text", ""), metadata.get("title", ""), metadata.get("topic", ""))).casefold(),
            )
        )
        if anchors.intersection(passage_terms):
            relevant.append(passage)
    return relevant


def basic_identity_reply(question):
    normalized = re.sub(r"[\W_]+", " ", question.casefold()).strip()
    greeting = GREETING_REPLIES.get(normalized)
    if greeting:
        return greeting
    if normalized in IDENTITY_QUESTIONS:
        return (
            "Hi! I'm TradeLab's AI tutor. I can help you learn about investing, understand financial "
            "concepts, and practice your knowledge in a simulated environment. For source-dependent "
            "financial facts, I use relevant material from the local knowledge library and acknowledge "
            "when it doesn't support an answer."
        )
    return None


def api_error(status, code, message, field=None):
    error = {"code": code, "message": message}
    if field:
        error["field"] = field
    return jsonify(error=error), status


def sse_event(name, payload):
    return f"event: {name}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


def stream_text_reply(content, source, model=None):
    def generate():
        yield sse_event("meta", {"source": source, "model": model})
        yield sse_event("token", {"content": content})
        yield sse_event("done", {"source": source, "model": model})

    return Response(
        stream_with_context(generate()),
        content_type="text/event-stream; charset=utf-8",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def stream_model_reply(model_payload, source):
    def generate():
        response = None
        content_emitted = False
        stream_finished = False
        finish_reason = None
        try:
            response = requests.post(
                LLAMA_URL,
                json={**model_payload, "stream": True},
                timeout=(5, 110),
                stream=True,
            )
            response.raise_for_status()
            yield sse_event("meta", {"source": source, "model": MODEL_LABEL})
            for line in response.iter_lines(decode_unicode=False):
                if not line:
                    continue
                if isinstance(line, bytes):
                    try:
                        line = line.decode("utf-8")
                    except UnicodeDecodeError:
                        yield sse_event(
                            "error",
                            {
                                "code": "tutor_bad_response",
                                "message": "The local model returned text that was not valid UTF-8.",
                            },
                        )
                        return
                line = line.strip()
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    stream_finished = True
                    break
                try:
                    event = json.loads(data)
                    choice = event["choices"][0]
                    finish_reason = choice.get("finish_reason") or finish_reason
                    delta = choice.get("delta", {})
                    token = delta.get("content", "")
                except (ValueError, KeyError, IndexError, TypeError):
                    yield sse_event(
                        "error",
                        {"code": "tutor_bad_response", "message": "The local model returned an unreadable response."},
                    )
                    return
                if isinstance(token, str) and token:
                    content_emitted = True
                    yield sse_event("token", {"content": token})
            if not stream_finished or not content_emitted:
                yield sse_event(
                    "error",
                    {
                        "code": "tutor_bad_response",
                        "message": "The local model returned an incomplete or empty response. Please try again.",
                    },
                )
                return
            if finish_reason in TOKEN_LIMIT_FINISH_REASONS:
                app.logger.warning("Tutor response reached the output token limit (%s tokens).", model_payload.get("max_tokens"))
                yield sse_event(
                    "error",
                    {
                        "code": "tutor_output_limit",
                        "message": (
                            "The tutor reached its response length limit before finishing. "
                            "The partial answer is preserved; ask it to continue if you want the rest."
                        ),
                        "finish_reason": finish_reason,
                        "max_tokens": model_payload.get("max_tokens"),
                    },
                )
                return
            yield sse_event("done", {"source": source, "model": MODEL_LABEL, "finish_reason": finish_reason})
        except requests.Timeout:
            yield sse_event(
                "error",
                {"code": "tutor_timeout", "message": "The tutor took too long to answer. Try a shorter question."},
            )
        except requests.RequestException:
            yield sse_event(
                "error",
                {"code": "tutor_unavailable", "message": "The local Qwen model is unavailable. Check that llama-server is running."},
            )
        finally:
            if response is not None:
                response.close()

    return Response(
        stream_with_context(generate()),
        content_type="text/event-stream; charset=utf-8",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def read_system_prompt():
    try:
        prompt = SYSTEM_PROMPT_PATH.read_text(encoding="utf-8").strip()
    except OSError:
        app.logger.exception("Tutor system prompt could not be loaded.")
        return None
    return prompt or None


@app.errorhandler(413)
def request_too_large(_error):
    del _error
    return api_error(413, "request_too_large", "The tutor request is too large.")


@app.get("/")
def index():
    return send_from_directory(PROJECT_ROOT, "index.html", max_age=0)


@app.route("/<path:filename>", methods=["GET", "HEAD"])
def frontend_file(filename):
    if filename == "api" or filename.startswith("api/"):
        return api_error(404, "not_found", "That endpoint doesn't exist.")

    path = PurePosixPath(filename)
    if (
        "\\" in filename
        or any(part in {".", ".."} for part in path.parts)
        or not (filename == "index.html" or path.parts[0] in {"assets", "css", "js"})
    ):
        return "Not found", 404
    return send_from_directory(PROJECT_ROOT, filename, max_age=0)


@app.post("/api/tutor/chat")
def tutor_chat():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return api_error(400, "invalid_request", "Send a valid JSON object.", "messages")

    messages = body.get("messages")
    if not isinstance(messages, list) or not messages:
        return api_error(400, "invalid_request", "Add a message for the tutor.", "messages")

    history = []
    for message in messages:
        role = message.get("role") if isinstance(message, dict) else None
        if not isinstance(role, str) or role not in {"user", "assistant"}:
            return api_error(400, "invalid_message", "Messages must use the user or assistant role.", "messages")
        content = message.get("content")
        if not isinstance(content, str) or not content.strip():
            return api_error(400, "invalid_message", "Each message must include non-empty text.", "messages")
        message_limit = MAX_MESSAGE_LENGTH if role == "user" else MAX_ASSISTANT_MESSAGE_LENGTH
        if len(content) > message_limit:
            return api_error(
                400,
                "message_too_long",
                f"{role.capitalize()} messages must be {message_limit:,} characters or fewer.",
                "messages",
            )
        history.append({"role": role, "content": content.strip()})

    if history[-1]["role"] != "user":
        return api_error(400, "invalid_request", "End the conversation with a question for the tutor.", "messages")

    context = body.get("context", {})
    if not isinstance(context, dict):
        return api_error(400, "invalid_context", "Tutor context must be an object.", "context")
    level = context.get("level", "beginner")
    if not isinstance(level, str) or level not in LEVEL_GUIDANCE:
        return api_error(400, "invalid_context", "Choose beginner, intermediate, or advanced learning level.", "context")

    basic_reply = basic_identity_reply(history[-1]["content"])
    if basic_reply is not None:
        if body.get("stream") is True:
            return stream_text_reply(basic_reply, "tutor")
        return jsonify(
            reply={
                "content": basic_reply,
                "source": "tutor",
                "model": None,
            }
        )

    system_prompt = read_system_prompt()
    if system_prompt is None:
        return api_error(500, "system_prompt_unavailable", "The tutor's system prompt could not be loaded.")

    bounded_messages = bounded_history(history)
    retrieval_query = retrieval_query_for_history(bounded_messages)
    try:
        passages = retrieve_relevant(retrieval_query, index_path=INDEX_PATH)
        passages = filter_contextual_passages(bounded_messages, passages)
    except KnowledgeBaseError:
        app.logger.exception("The local tutor knowledge index could not be read.")
        return api_error(500, "knowledge_index_unavailable", "The local tutor knowledge index could not be read. Rebuild it and try again.")

    if not passages:
        retrieval_context = NO_EVIDENCE_GUIDANCE
    else:
        retrieval_context = build_retrieval_context(passages)

    system_message = "\n\n".join(
        (
            system_prompt,
            f"Learner level: {level}. {LEVEL_GUIDANCE[level]}",
            retrieval_context,
        )
    )

    model_payload = {
        "messages": [{"role": "system", "content": system_message}, *bounded_messages],
        "temperature": 0.4,
        "max_tokens": MAX_COMPLETION_TOKENS,
        "chat_template_kwargs": {"enable_thinking": False},
    }
    source = "llm" if passages else "llm_unverified"
    if body.get("stream") is True:
        return stream_model_reply(model_payload, source)

    try:
        response = requests.post(LLAMA_URL, json=model_payload, timeout=(5, 110))
        response.raise_for_status()
    except requests.Timeout:
        return api_error(504, "tutor_timeout", "The tutor took too long to answer. Try a shorter question.")
    except requests.RequestException:
        return api_error(503, "tutor_unavailable", "The local Qwen model is unavailable. Check that llama-server is running.")

    try:
        model_response = response.json()
        choice = model_response["choices"][0]
        content = choice["message"]["content"]
        finish_reason = choice.get("finish_reason")
    except (ValueError, KeyError, IndexError, TypeError):
        content = None
        finish_reason = None

    if not isinstance(content, str) or not content.strip():
        return api_error(502, "tutor_bad_response", "The local model returned an unreadable response. Please try again.")
    if finish_reason in TOKEN_LIMIT_FINISH_REASONS:
        app.logger.warning("Tutor non-streaming response reached the output token limit (%s tokens).", model_payload.get("max_tokens"))
        return jsonify(
            reply={
                "content": content.strip(),
                "source": source,
                "model": MODEL_LABEL,
                "interrupted": True,
                "finish_reason": finish_reason,
            }
        ), 206

    reply = {
        "content": content.strip(),
        "source": source,
        "model": MODEL_LABEL,
    }
    if finish_reason:
        reply["finish_reason"] = finish_reason
    return jsonify(reply=reply)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
