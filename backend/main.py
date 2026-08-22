import asyncio
import json
import os
import sys
from pathlib import Path
from typing import List, Optional

_BACKEND_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _BACKEND_DIR.parent
for _path in (_PROJECT_ROOT, _BACKEND_DIR):
    _path_str = str(_path)
    if _path_str not in sys.path:
        sys.path.insert(0, _path_str)

from dotenv import find_dotenv, load_dotenv

load_dotenv(find_dotenv())

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openai import OpenAI
from pydantic import BaseModel

from core.ai_engine import (
    build_spark_helper_messages,
    generate_chat_reply,
    generate_innovator_lite_project,
    generate_projects,
    generate_spark_helper_reply,
    run_safety_check,
    stream_chat_deltas,
)
from core.model_routing import (
    MAX_TOKENS_SPARK_HELPER,
    MODEL_SPARK_HELPER,
    should_run_post_safety,
)
from concept_render_prompt import build_concept_render_prompt
from validators.generation_pipeline import run_validated_generation
from validators.field_alignment import (
    extract_field_from_description,
    infer_engineering_field_from_text,
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_DIAGRAM_TIMEOUT = httpx.Timeout(75.0, connect=12.0)
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"), timeout=_DIAGRAM_TIMEOUT)


def personality_layer(mode: str, education: str = None, age_group: str = None):
    parts = ["SparkAI on Enginuity — safe, practical engineering help."]
    mode_bits = {
        "Apprentice": "Simple step-by-step; no assumed prior knowledge.",
        "Associate": "Collaborative: options and trade-offs; user decides.",
        "Innovator": "User leads; concise technical assist when asked.",
    }
    if mode in mode_bits:
        parts.append(mode_bits[mode])
    edu_bits = {
        "Middle-Schooler(10-14 years old)🖍️": "Very simple language.",
        "High-Schooler(15-18 years old)🏫": "Moderate detail.",
        "Student(18-25 years old)🎓": "Solid basics assumed.",
        "Adult": "Concise and practical.",
    }
    if education in edu_bits:
        parts.append(edu_bits[education])
    tone_bits = {
        "child": "Friendly, encouraging.",
        "teen": "Engaging and clear.",
        "adult": "Professional and clear.",
    }
    if age_group in tone_bits:
        parts.append(tone_bits[age_group])
    return " ".join(parts)


def is_dangerous_input(text: str):
    dangerous_keywords = [
        "bomb",
        "explosive",
        "gunpowder",
        "detonator",
        "bleach and ammonia",
        "toxic gas",
        "chlorine gas",
        "poison",
        "acid attack",
        "sulfuric acid",
        "nitric acid",
        "how to start a fire indoors",
        "arson",
    ]
    text_lower = text.lower()
    return any(keyword in text_lower for keyword in dangerous_keywords)


def _generation_error_response(err: dict) -> dict:
    """Top-level error shape expected by the frontend (not nested under projects)."""
    out = {"error": err.get("error") or "Generation failed."}
    if err.get("details") is not None:
        out["details"] = err["details"]
    if err.get("suggestion"):
        out["suggestion"] = err["suggestion"]
    if err.get("raw") is not None:
        out["raw"] = err["raw"]
    return out


def _openai_error_response(exc: Exception) -> dict:
    """Map OpenAI / network failures to a frontend-friendly JSON error."""
    name = type(exc).__name__
    text = str(exc).lower()
    if name == "RateLimitError" or "insufficient_quota" in text or "rate limit" in text:
        return {
            "error": "SparkAI is temporarily unavailable — the API quota has been reached.",
            "suggestion": "Please try again later or contact the Enginuity team.",
        }
    if name == "AuthenticationError" or "invalid api key" in text:
        return {
            "error": "SparkAI is not configured on the server.",
            "suggestion": "Contact the Enginuity team.",
        }
    if name in ("APIConnectionError", "APITimeoutError") or "timeout" in text:
        return {
            "error": "SparkAI timed out while generating your project.",
            "suggestion": "Please try again in a moment.",
        }
    return {
        "error": "SparkAI could not complete your request.",
        "details": str(exc)[:240],
    }


def infer_project_mode(description: str, explicit_mode: str = "") -> str:
    if explicit_mode and explicit_mode.strip():
        return explicit_mode.strip()
    d = (description or "").lower()
    if "associate mode" in d:
        return "Associate"
    if "apprentice mode" in d:
        return "Apprentice"
    return "Apprentice"


def _generation_scale_hint(difficulty: str, mode: str = "") -> str:
    """Extra instructions so long / hard builds get enough steps and build phases."""
    m = (mode or "").strip().lower()
    if "apprentice" in m:
        return (
            "SCALE (Apprentice): Keep 8–14 steps in a single part. "
            "Match difficulty by depth and precision per step — not multi-day phase counts."
        )

    d = (difficulty or "").strip().lower()
    if "day" in d:
        return (
            "SCALE (mandatory): This is a MULTI-DAY build. Return 25–40 detailed steps split "
            "across 3–4 build_phases (Design & Planning, Mechanical Assembly, "
            "Electronics/Wiring, Programming & Testing as applicable). "
            "Include planning, measurements, dry-fit, wiring, code upload, and testing steps. "
            "Do NOT return fewer than 20 steps or a single compressed part."
        )
    if "hard" in d:
        if any(x in d for x in ("150", "120", "180", "hour", "hr")):
            return (
                "SCALE: Long hard build — 18–28 detailed steps minimum across 2–3 build_phases. "
                "Separate mechanical, electronics, and testing when motors/Arduino/LEDs are involved."
            )
        return (
            "SCALE: Hard build — 15–22 detailed steps; use 2 build_phases when mixing "
            "structure with electronics or programming."
        )
    if "medium" in d:
        return (
            "SCALE: Medium build — 14–22 detailed steps; use build_phases when the project "
            "has distinct mechanical and electronics stages."
        )
    return "SCALE: Easy build — 8–14 clear steps; build_phases optional."


class ProjectRequest(BaseModel):
    description: str
    difficulty: str = "beginner"
    age: str = ""
    materials: str = ""
    mode: str = ""
    engineering_field: str = ""


class ChatRequest(BaseModel):
    message: str
    context: str = ""
    history: List[dict] = []
    education: Optional[str] = None
    mode: str = "Innovator"
    stream: bool = False


class InnovatorLiteRequest(BaseModel):
    materials: List[str] = []
    education: Optional[str] = None
    tutorial: bool = False
    difficulty: str = ""
    description: str = ""
    engineering_field: str = ""


def _normalize_innovator_lite_education(value: Optional[str]) -> str:
    raw = (value or "").strip().lower()
    mapping = {
        "middle": "Middle-Schooler (10–14)",
        "middle-schooler": "Middle-Schooler (10–14)",
        "middle school": "Middle-Schooler (10–14)",
        "high": "High-Schooler (15–18)",
        "high-schooler": "High-Schooler (15–18)",
        "high school": "High-Schooler (15–18)",
        "student": "Student (18–25)",
        "adult": "Student (18–25)",
    }
    if raw in mapping:
        return mapping[raw]
    if "middle" in raw or "10" in raw:
        return "Middle-Schooler (10–14)"
    if "high" in raw or "15" in raw:
        return "High-Schooler (15–18)"
    if "student" in raw or "18" in raw:
        return "Student (18–25)"
    if "adult" in raw or "25" in raw:
        return "Student (18–25)"
    if (value or "").strip():
        return (value or "").strip()
    return "High-Schooler (15–18)"


@app.get("/")
def root():
    return {"status": "Enginuity API — SparkAI ready"}


@app.get("/public-config/contact")
def public_contact_config():
    email = (os.getenv("CONTACT_EMAIL", "ndumela.bonolo@gmail.com") or "").strip()
    return {"email": email}


@app.post("/chat-innovator")
async def chat(request: ChatRequest):
    messages = []
    system_prompt = personality_layer(request.mode, request.education)
    if request.context and request.context.strip():
        system_prompt = f"{system_prompt}\n\nUser context:\n{request.context.strip()}"
    messages.append({"role": "system", "content": system_prompt})

    for msg in request.history:
        if msg.get("content"):
            messages.append(msg)

    messages.append({"role": "user", "content": request.message})

    reply = await asyncio.to_thread(generate_chat_reply, messages, request.mode)
    return {"reply": reply}


@app.post("/generate-project")
async def generate_project(request: ProjectRequest):
    if is_dangerous_input(request.description):
        return {
            "error": "⚠️ This request may be unsafe. Please try a different project idea."
        }

    mode = infer_project_mode(request.description, request.mode)
    engineering_field = (request.engineering_field or "").strip()
    if not engineering_field:
        engineering_field = extract_field_from_description(request.description)

    age = (request.age or "").strip()
    if age in ("25+", "25-99", "adult"):
        age = "18-25"

    full_input = (
        f"Idea: {request.description}\n"
        f"Difficulty: {request.difficulty}\n"
        f"Age: {age}\n"
        f"Materials: {request.materials}\n"
        f"Mode: {mode}\n"
    )
    if engineering_field:
        full_input += (
            f"Engineering field (STRICT — every project must clearly belong here): "
            f"{engineering_field}\n"
        )
    full_input += (
        f"{_generation_scale_hint(request.difficulty, mode)}\n"
        "Return 3 JSON projects per system rules."
    )

    def _generate_and_safety_check():
        raw = generate_projects(full_input, mode, difficulty=request.difficulty)
        if isinstance(raw, dict) and raw.get("error"):
            return raw
        if should_run_post_safety(mode):
            safe = run_safety_check(raw)
        else:
            safe = raw
            if isinstance(safe, dict) and "safety_warnings" not in safe:
                safe["safety_warnings"] = safe.get("safety_warnings") or []
        return safe

    try:
        safe_projects, _validation = await asyncio.to_thread(
            run_validated_generation,
            _generate_and_safety_check,
            mode=mode,
            difficulty_hint=request.difficulty,
            concept_render_enabled=True,
            lite_mode=False,
            label=mode,
            engineering_field=engineering_field,
        )
    except Exception as exc:
        return _openai_error_response(exc)

    if isinstance(safe_projects, dict) and safe_projects.get("error"):
        return _generation_error_response(safe_projects)

    return {"projects": safe_projects}


@app.post("/generate-innovator-lite")
async def generate_innovator_lite(request: InnovatorLiteRequest):
    materials = request.materials or []
    if not isinstance(materials, list):
        return {"error": "Materials must be a list of strings."}

    normalized_materials = [str(m).strip() for m in materials if str(m).strip()]
    if not normalized_materials:
        return {"error": "Please provide at least one material."}

    education = _normalize_innovator_lite_education(request.education)
    tutorial = bool(request.tutorial)
    difficulty = (request.difficulty or "").strip()
    if not tutorial and not difficulty:
        difficulty = "Medium: 4–12 hours"

    description = (request.description or "").strip()
    engineering_field = (request.engineering_field or "").strip()
    if not engineering_field:
        engineering_field = extract_field_from_description(description)
    if not engineering_field:
        engineering_field = infer_engineering_field_from_text(description)

    def _generate_lite():
        return generate_innovator_lite_project(
            normalized_materials,
            education,
            tutorial=tutorial,
            difficulty=difficulty,
            description=description,
            engineering_field=engineering_field,
        )

    validation_difficulty = "15-20 minutes" if tutorial else difficulty
    validation_mode = "Innovator Beta"

    try:
        generated, _validation = await asyncio.to_thread(
            run_validated_generation,
            _generate_lite,
            mode=validation_mode,
            difficulty_hint=validation_difficulty,
            concept_render_enabled=not tutorial,
            lite_mode=True,
            label="Innovator Beta tutorial" if tutorial else "Innovator Beta",
            engineering_field=engineering_field,
        )
    except Exception as exc:
        return _openai_error_response(exc)
    if generated.get("error"):
        return generated

    def cleaned_text(value, default=""):
        if value is None:
            return default
        text = str(value).strip()
        return text if text else default

    default_time = "15-20 minutes" if tutorial else difficulty or "4–12 hours"
    default_diff = "Beginner" if tutorial else "Intermediate"

    result = {
        "title": cleaned_text(generated.get("title", ""), ""),
        "description": cleaned_text(generated.get("description", ""), ""),
        "estimated_time": cleaned_text(generated.get("estimated_time"), default_time),
        "difficulty": cleaned_text(generated.get("difficulty"), default_diff),
        "materials": [
            str(m).strip() for m in generated.get("materials", []) if str(m).strip()
        ],
        "steps": [str(s).strip() for s in generated.get("steps", []) if str(s).strip()],
        "science_explanation": cleaned_text(generated.get("science_explanation", ""), ""),
        "build_phases": generated.get("build_phases") or [],
        "tutorial": tutorial,
        "engineering_field": engineering_field,
    }

    if not result["materials"]:
        result["materials"] = normalized_materials

    if not result["steps"]:
        return {"error": "Could not generate onboarding steps. Please try again."}

    if tutorial and len(result["steps"]) > 7:
        result["steps"] = result["steps"][:7]

    return result


def _spark_helper_stream(messages):
    def event_generator():
        try:
            for piece in stream_chat_deltas(
                messages,
                model=MODEL_SPARK_HELPER,
                max_tokens=MAX_TOKENS_SPARK_HELPER,
                temperature=0.65,
            ):
                yield f"data: {json.dumps({'delta': piece})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/chat-helper")
async def spark_helper(data: ChatRequest):
    context = (data.context or "").strip()
    message = (data.message or "").strip()
    mode = (data.mode or "Apprentice").strip()

    if not message:
        return {"reply": "Please enter a question."}

    messages = build_spark_helper_messages(
        message, context=context, history=data.history, mode=mode
    )

    if data.stream:
        return _spark_helper_stream(messages)

    reply = await asyncio.to_thread(
        generate_spark_helper_reply,
        message,
        context=context,
        history=data.history,
        mode=mode,
    )
    return {"reply": reply}


async def _generate_concept_render_image(data: dict):
    prompt = build_concept_render_prompt(data)
    try:
        result = await asyncio.to_thread(
            lambda: client.images.generate(
                model="gpt-image-1",
                prompt=prompt,
                size="1024x1024",
            )
        )
    except Exception as exc:
        return _openai_error_response(exc)

    image_base64 = result.data[0].b64_json
    image_url = f"data:image/png;base64,{image_base64}"
    return {"image_url": image_url}


@app.post("/generate-concept-render")
async def generate_concept_render(data: dict):
    phase_steps = (data or {}).get("phase_steps") or []
    if not isinstance(phase_steps, list) or not [
        s for s in phase_steps if str(s).strip()
    ]:
        raise HTTPException(status_code=400, detail="Phase steps are required.")
    return await _generate_concept_render_image(data)


@app.post("/generate-diagram")
async def generate_diagram_legacy(data: dict):
    """Legacy alias — redirects to Concept Render."""
    return await generate_concept_render(data)


class BetaFeedbackRequest(BaseModel):
    user_id: Optional[str] = None
    session_type: str = "Associate"
    rating: int = 0
    feedback: Optional[str] = ""
    timestamp: Optional[str] = None


@app.post("/beta-feedback")
async def submit_beta_feedback(payload: BetaFeedbackRequest):
    """Store beta feedback for analytics / future admin dashboard."""
    from datetime import datetime, timezone
    from pathlib import Path

    session_type = (payload.session_type or "Associate").strip()
    if session_type not in ("Associate", "Innovator"):
        if "innovator" in session_type.lower():
            session_type = "Innovator"
        else:
            session_type = "Associate"

    rating = payload.rating if isinstance(payload.rating, int) else 0
    if rating < 0:
        rating = 0
    if rating > 5:
        rating = 5

    record = {
        "user_id": (payload.user_id or "anonymous").strip() or "anonymous",
        "session_type": session_type,
        "rating": rating,
        "feedback": (payload.feedback or "").strip(),
        "timestamp": (payload.timestamp or "").strip()
        or datetime.now(timezone.utc).isoformat(),
    }

    data_dir = Path(__file__).resolve().parent / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    out_path = data_dir / "beta_feedback.jsonl"

    def _append():
        with out_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")

    await asyncio.to_thread(_append)

    user_id = record["user_id"]
    if user_id and "@" in user_id:
        from user_store import sync_user, touch_activity

        await asyncio.to_thread(
            sync_user,
            user_id,
            "",
            "free",
            increment_sessions=1,
        )
        await asyncio.to_thread(
            touch_activity,
            user_id,
            "session_complete",
            {"mode": session_type},
        )

    return {"ok": True, "record": record}


class UserSyncRequest(BaseModel):
    email: str
    name: Optional[str] = ""
    plan: Optional[str] = "free"
    preferences: Optional[dict] = None


class UserActivityRequest(BaseModel):
    email: str
    event_type: Optional[str] = "activity"
    mode: Optional[str] = None


def _require_admin_email(x_user_email: Optional[str] = Header(None, alias="X-User-Email")) -> str:
    email = (x_user_email or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Authentication required.")
    from user_store import is_admin

    if not is_admin(email):
        raise HTTPException(status_code=403, detail="Admin access required.")
    return email


@app.post("/users/sync")
async def sync_user_account(payload: UserSyncRequest):
    """Register or refresh a user profile (called after Google sign-in)."""
    from user_store import sync_user

    email = (payload.email or "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required.")

    user = await asyncio.to_thread(
        sync_user,
        email,
        payload.name or "",
        payload.plan or "free",
        preferences=payload.preferences,
    )
    return {"ok": True, "user": user}


@app.get("/users/preferences")
async def get_user_preferences(email: str):
    from user_store import get_user, sync_user

    key = (email or "").strip().lower()
    if not key:
        raise HTTPException(status_code=400, detail="Email is required.")

    user = await asyncio.to_thread(get_user, key)
    if not user:
        user = await asyncio.to_thread(sync_user, key, "", "free")
    return {"ok": True, "preferences": user.get("preferences") or {}}


@app.post("/users/preferences")
async def save_user_preferences(payload: UserSyncRequest):
    from user_store import update_user_preferences

    email = (payload.email or "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required.")
    if not isinstance(payload.preferences, dict):
        raise HTTPException(status_code=400, detail="Preferences object is required.")

    user = await asyncio.to_thread(
        update_user_preferences,
        email,
        payload.preferences,
    )
    return {"ok": True, "user": user}


@app.post("/users/activity")
async def record_user_activity(payload: UserActivityRequest):
    """Track user activity for admin analytics."""
    from user_store import touch_activity

    email = (payload.email or "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required.")

    metadata = {}
    if payload.mode:
        metadata["mode"] = payload.mode.strip()

    user = await asyncio.to_thread(
        touch_activity,
        email,
        payload.event_type or "activity",
        metadata,
    )
    return {"ok": True, "user": user}


@app.get("/auth/role")
async def get_user_role(email: str):
    """Return role for a signed-in user (used by admin gate)."""
    from user_store import get_user, is_admin, sync_user

    key = (email or "").strip().lower()
    if not key:
        raise HTTPException(status_code=400, detail="Email is required.")

    if await asyncio.to_thread(is_admin, key):
        user = await asyncio.to_thread(get_user, key)
        if not user:
            user = await asyncio.to_thread(sync_user, key, "", "free")
        return {
            "ok": True,
            "email": key,
            "role": "admin",
            "is_admin": True,
        }

    user = await asyncio.to_thread(get_user, key)
    role = user.get("role", "user") if user else "user"
    return {
        "ok": True,
        "email": key,
        "role": role,
        "is_admin": False,
    }


@app.get("/admin/overview")
async def admin_overview(_admin: str = Depends(_require_admin_email)):
    from user_store import get_overview_stats

    return {"ok": True, "overview": await asyncio.to_thread(get_overview_stats)}


@app.get("/admin/users")
async def admin_users(_admin: str = Depends(_require_admin_email)):
    from user_store import list_users

    return {"ok": True, "users": await asyncio.to_thread(list_users)}


@app.get("/admin/feedback")
async def admin_feedback(_admin: str = Depends(_require_admin_email)):
    from user_store import read_feedback_records

    return {"ok": True, "feedback": await asyncio.to_thread(read_feedback_records)}


@app.get("/admin/analytics")
async def admin_analytics(_admin: str = Depends(_require_admin_email)):
    from user_store import get_analytics_snapshot

    return {"ok": True, "analytics": await asyncio.to_thread(get_analytics_snapshot)}


@app.get("/admin/payments")
async def admin_payments(_admin: str = Depends(_require_admin_email)):
    from user_store import get_payments_snapshot

    return {"ok": True, "payments": await asyncio.to_thread(get_payments_snapshot)}


@app.get("/admin/settings")
async def admin_settings(_admin: str = Depends(_require_admin_email)):
    from user_store import get_settings_snapshot

    return {"ok": True, "settings": await asyncio.to_thread(get_settings_snapshot)}
