import json
import os
import re
from typing import Generator, List, Optional
from dotenv import find_dotenv, load_dotenv
import httpx
from openai import OpenAI
from prompt.prompts import SYSTEM_PROMPT, INNOVATOR_LITE_PROMPT
from core.model_routing import (
    MODEL_SPARK_HELPER,
    MODEL_SAFETY,
    MODEL_INNOVATOR_LITE,
    MAX_HELPER_CONTEXT_CHARS,
    MAX_HELPER_HISTORY,
    MAX_TOKENS_INNOVATOR_LITE,
    MAX_TOKENS_SAFETY,
    MAX_TOKENS_SPARK_HELPER,
    max_tokens_for_chat,
    max_tokens_for_mode,
    model_for_mode,
)

load_dotenv(find_dotenv())

_OPENAI_TIMEOUT = httpx.Timeout(55.0, connect=12.0)
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"), timeout=_OPENAI_TIMEOUT)

SPARK_HELPER_SYSTEM = """You are SparkHelper — an engineering mentor in Enginuity (not SparkAI; you do not generate full new projects).

ALLOW: improve the current build; explain science/engineering; compare designs (e.g. glider vs jet); discuss aerodynamics, torque, stability; answer why/how; suggest safe experiments (e.g. longer flight, stronger joints).

NOT ALLOWED: a complete unrelated step-by-step build from scratch. If they want a brand-new project, warmly point them to SparkAI on their mode page, then offer help improving what they have.

Mode tone: {mode_hint}

Be concise, direct, and encouraging — not restrictive. Plain language, no # headings; short paragraphs or bullets.

Project context:
{context}"""


def _extract_balanced_json_substring(text: str) -> Optional[str]:
    """First balanced {...} or [...] in text (string-aware; matches frontend parser)."""
    if not text:
        return None
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```(?:json)?\s*", "", t, flags=re.IGNORECASE)
        t = re.sub(r"\s*```\s*$", "", t).strip()

    first_obj = t.find("{")
    first_arr = t.find("[")
    if first_obj == -1:
        i0 = first_arr
    elif first_arr == -1:
        i0 = first_obj
    else:
        i0 = min(first_obj, first_arr)
    if i0 == -1:
        return None

    stack: List[str] = []
    in_string = False
    escape = False
    for i in range(i0, len(t)):
        ch = t[i]
        if in_string:
            if escape:
                escape = False
                continue
            if ch == "\\":
                escape = True
                continue
            if ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
            continue
        if ch == "{":
            stack.append("}")
            continue
        if ch == "[":
            stack.append("]")
            continue
        if ch in ("}", "]"):
            if not stack or ch != stack[-1]:
                continue
            stack.pop()
            if not stack:
                return t[i0 : i + 1]
    return None


def _extract_first_json_object(text: str):
    snippet = _extract_balanced_json_substring(text)
    if not snippet:
        return None
    try:
        parsed = json.loads(snippet)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _normalize_step_string(text) -> str:
    """Clean a single step string for UI display (no markdown bullets or em-dashes)."""
    s = str(text or "").strip()
    if not s:
        return ""
    s = re.sub(r"^\s*[-*•]\s+", "", s)
    s = re.sub(r"^(Step\s+\d+)\s*[—–-]\s*", r"\1: ", s, flags=re.IGNORECASE)
    s = re.sub(r"\s*\n+\s*", " ", s)
    s = re.sub(r"\s+[-*•]\s+", ". ", s)
    s = re.sub(r"\.\s*\.", ".", s)
    s = re.sub(r"\s{2,}", " ", s).strip()
    return s


def normalize_steps(steps) -> List[str]:
    """Coerce model step output into a flat list of display-ready strings."""
    if steps is None:
        return []
    raw_items: List = []
    if isinstance(steps, str):
        trimmed = steps.strip()
        if trimmed:
            if trimmed.startswith("[") and trimmed.endswith("]"):
                try:
                    parsed = json.loads(trimmed)
                    if isinstance(parsed, list):
                        raw_items = parsed
                    else:
                        raw_items = [trimmed]
                except json.JSONDecodeError:
                    raw_items = re.split(
                        r"(?=Step\s+\d+\s*[:.)—-])", trimmed, flags=re.IGNORECASE
                    )
            else:
                raw_items = re.split(
                    r"(?=Step\s+\d+\s*[:.)—-])", trimmed, flags=re.IGNORECASE
                )
    elif isinstance(steps, list):
        raw_items = steps
    elif isinstance(steps, dict):
        raw_items = list(steps.values())
    else:
        raw_items = [steps]

    out: List[str] = []
    for item in raw_items:
        if item is None or item == "":
            continue
        if isinstance(item, dict):
            text = (
                item.get("text")
                or item.get("step")
                or item.get("instruction")
                or item.get("title")
                or ""
            )
            sub = item.get("substeps") or item.get("bullets")
            if isinstance(sub, list):
                text = (str(text) + " " + " ".join(str(x) for x in sub)).strip()
            if not text:
                text = json.dumps(item, ensure_ascii=False)
            item = text
        normalized = _normalize_step_string(item)
        if normalized:
            out.append(normalized)
    return out


def _normalize_project_steps_in_payload(data: dict) -> dict:
    if not isinstance(data, dict):
        return data
    projects = data.get("projects")
    if isinstance(projects, list):
        for proj in projects:
            if isinstance(proj, dict) and "steps" in proj:
                proj["steps"] = normalize_steps(proj.get("steps"))
    if "steps" in data:
        data["steps"] = normalize_steps(data.get("steps"))
    return data


def chat_completion(
    messages: List[dict],
    *,
    model: str,
    max_tokens: int,
    temperature: float = 0.7,
    stream: bool = False,
    json_object: bool = False,
):
    kwargs = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": stream,
    }
    if json_object and not stream:
        kwargs["response_format"] = {"type": "json_object"}
    return client.chat.completions.create(**kwargs)


def stream_chat_deltas(
    messages: List[dict],
    *,
    model: str,
    max_tokens: int,
    temperature: float = 0.7,
) -> Generator[str, None, None]:
    stream = chat_completion(
        messages,
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
        stream=True,
    )
    for chunk in stream:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta
        if delta and delta.content:
            yield delta.content


def _spark_helper_mode_hint(mode: str) -> str:
    hints = {
        "Apprentice": "Simple step-by-step language.",
        "Associate": "Collaborative: options and trade-offs.",
        "Innovator": "Concise; user leads.",
        "Innovator Lite": "Welcoming, motivating, first build.",
    }
    return hints.get((mode or "").strip(), "Clear and encouraging.")


def trim_helper_context(context: str) -> str:
    text = (context or "").strip()
    if len(text) <= MAX_HELPER_CONTEXT_CHARS:
        return text
    return text[: MAX_HELPER_CONTEXT_CHARS - 20] + "\n…(truncated)"


def trim_helper_history(history: List[dict]) -> List[dict]:
    cleaned = []
    for msg in history or []:
        role = msg.get("role")
        content = msg.get("content")
        if role in ("user", "assistant") and content:
            cleaned.append({"role": role, "content": str(content).strip()})
    if len(cleaned) > MAX_HELPER_HISTORY:
        cleaned = cleaned[-MAX_HELPER_HISTORY:]
    return cleaned


def build_spark_helper_messages(
    message: str,
    context: str = "",
    history: Optional[List[dict]] = None,
    mode: str = "Apprentice",
) -> List[dict]:
    system = SPARK_HELPER_SYSTEM.format(
        mode_hint=_spark_helper_mode_hint(mode),
        context=trim_helper_context(context) or "(No project loaded.)",
    )
    messages = [{"role": "system", "content": system}]
    messages.extend(trim_helper_history(history))
    messages.append({"role": "user", "content": message.strip()})
    return messages


def generate_spark_helper_reply(
    message: str,
    context: str = "",
    history: Optional[List[dict]] = None,
    mode: str = "Apprentice",
) -> str:
    messages = build_spark_helper_messages(message, context, history, mode)
    response = chat_completion(
        messages,
        model=MODEL_SPARK_HELPER,
        max_tokens=MAX_TOKENS_SPARK_HELPER,
        temperature=0.65,
    )
    return response.choices[0].message.content or ""


def generate_chat_reply(messages: List[dict], mode: Optional[str] = None) -> str:
    """Conversational replies. When mode is omitted, use gpt-4o-mini (legacy default)."""
    if mode and str(mode).strip():
        model = model_for_mode(mode)
        max_tokens = max_tokens_for_chat(mode)
    else:
        model = MODEL_SPARK_HELPER
        max_tokens = MAX_TOKENS_SPARK_HELPER
    response = chat_completion(
        messages,
        model=model,
        max_tokens=max_tokens,
        temperature=0.7,
    )
    return response.choices[0].message.content or ""


def generate_projects(full_input: str, mode: str = "Apprentice"):
    model = model_for_mode(mode)
    max_tokens = max_tokens_for_mode(mode)

    response = chat_completion(
        [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": full_input},
        ],
        model=model,
        max_tokens=max_tokens,
        temperature=0.75,
        json_object=True,
    )

    content = response.choices[0].message.content
    parsed = _extract_first_json_object(content)

    if parsed is None:
        return {"error": "AI returned invalid JSON", "raw": content}

    return _normalize_project_steps_in_payload(parsed)


def generate_innovator_lite_project(materials: list):
    materials_text = ", ".join(materials)
    user_prompt = (
        f"Materials available: {materials_text}\n"
        "Create one beginner-friendly project using mostly these items."
    )

    response = chat_completion(
        [
            {"role": "system", "content": INNOVATOR_LITE_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        model=MODEL_INNOVATOR_LITE,
        max_tokens=MAX_TOKENS_INNOVATOR_LITE,
        temperature=0.75,
        json_object=True,
    )

    content = response.choices[0].message.content
    parsed = _extract_first_json_object(content)

    if parsed is None:
        return {"error": "AI returned invalid JSON", "raw": content}

    return _normalize_project_steps_in_payload(parsed)


def _compact_projects_for_safety(project_data):
    """Send only summaries to the safety model — faster and cheaper."""
    if not isinstance(project_data, dict):
        return project_data
    projects = project_data.get("projects")
    if not isinstance(projects, list):
        return {
            "safety_warnings": project_data.get("safety_warnings", []),
            "projects": [],
        }
    compact = []
    for p in projects[:3]:
        if not isinstance(p, dict):
            continue
        steps = p.get("steps") or []
        if isinstance(steps, list):
            step_preview = steps[:3]
        else:
            step_preview = [str(steps)[:200]]
        compact.append(
            {
                "project_name": (p.get("project_name") or "")[:120],
                "description": (p.get("description") or "")[:280],
                "materials_needed": (p.get("materials_needed") or [])[:12],
                "steps": step_preview,
            }
        )
    return {
        "safety_warnings": project_data.get("safety_warnings", []),
        "projects": compact,
    }


def run_safety_check(project_data):
    """Lightweight post-generation safety pass (single fast LLM call)."""
    payload = _compact_projects_for_safety(project_data)
    safety_prompt = [
        {
            "role": "system",
            "content": (
                "Safety inspector for home engineering projects. "
                'Return JSON only: {"risk_level":"LOW|MEDIUM|HIGH","warnings":[],"fix":""}. '
                "HIGH = serious injury/chemical/fire risk. MEDIUM = needs adult supervision. "
                "LOW = normal kid-safe build."
            ),
        },
        {
            "role": "user",
            "content": json.dumps(payload, ensure_ascii=False)[:2400],
        },
    ]

    try:
        response = chat_completion(
            safety_prompt,
            model=MODEL_SAFETY,
            max_tokens=MAX_TOKENS_SAFETY,
            temperature=0.2,
            json_object=True,
        )
        content = response.choices[0].message.content
        safety_result = _extract_first_json_object(content)
        if not safety_result:
            project_data["safety_warnings"] = []
            return project_data

        risk = safety_result.get("risk_level", "LOW")
        if risk == "HIGH":
            return {
                "error": "Project blocked for safety reasons.",
                "details": safety_result.get("warnings", []),
                "suggestion": safety_result.get("fix", ""),
            }

        project_data["safety_warnings"] = safety_result.get("warnings", [])
        return project_data

    except Exception:
        project_data["safety_warnings"] = []
        return project_data
