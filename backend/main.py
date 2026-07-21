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


def infer_project_mode(description: str, explicit_mode: str = "") -> str:
    if explicit_mode and explicit_mode.strip():
        return explicit_mode.strip()
    d = (description or "").lower()
    if "associate mode" in d:
        return "Associate"
    if "apprentice mode" in d:
        return "Apprentice"
    return "Apprentice"


class ProjectRequest(BaseModel):
    description: str
    difficulty: str = "beginner"
    age: str = ""
    materials: str = ""
    mode: str = ""


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
        "adult": "Adult (25+)",
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
        return "Adult (25+)"
    if (value or "").strip():
        return (value or "").strip()
    return "High-Schooler (15–18)"


@app.get("/")
def root():
    return {"status": "Enginuity API — SparkAI ready"}


@app.get("/public-config/contact")
def public_contact_config():
    email = (os.getenv("CONTACT_EMAIL", "") or "").strip()
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

    full_input = (
        f"Idea: {request.description}\n"
        f"Difficulty: {request.difficulty}\n"
        f"Age: {request.age}\n"
        f"Materials: {request.materials}\n"
        f"Mode: {mode}\n"
        "Return 3 JSON projects per system rules."
    )

    projects = await asyncio.to_thread(generate_projects, full_input, mode)

    if isinstance(projects, dict) and projects.get("error"):
        return _generation_error_response(projects)

    if should_run_post_safety(mode):
        safe_projects = await asyncio.to_thread(run_safety_check, projects)
    else:
        safe_projects = projects
        if isinstance(safe_projects, dict) and "safety_warnings" not in safe_projects:
            safe_projects["safety_warnings"] = safe_projects.get("safety_warnings") or []

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

    generated = await asyncio.to_thread(
        generate_innovator_lite_project,
        normalized_materials,
        _normalize_innovator_lite_education(request.education),
    )
    if generated.get("error"):
        return generated

    def cleaned_text(value, default=""):
        if value is None:
            return default
        text = str(value).strip()
        return text if text else default

    result = {
        "title": cleaned_text(generated.get("title", ""), ""),
        "description": cleaned_text(generated.get("description", ""), ""),
        "estimated_time": cleaned_text(generated.get("estimated_time"), "15-20 minutes"),
        "difficulty": cleaned_text(generated.get("difficulty"), "Beginner"),
        "materials": [
            str(m).strip() for m in generated.get("materials", []) if str(m).strip()
        ],
        "steps": [str(s).strip() for s in generated.get("steps", []) if str(s).strip()],
        "science_explanation": cleaned_text(generated.get("science_explanation", ""), ""),
    }

    if not result["materials"]:
        result["materials"] = normalized_materials

    if not result["steps"]:
        return {"error": "Could not generate onboarding steps. Please try again."}

    if len(result["steps"]) > 7:
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


@app.post("/generate-diagram")
async def generate_diagram(data: dict):
    step = str((data or {}).get("step") or "").strip()
    if not step:
        raise HTTPException(status_code=400, detail="Step text is required.")

    title = str((data or {}).get("title") or "").strip()
    description = str((data or {}).get("description") or "").strip()
    materials = (data or {}).get("materials") or []
    if not isinstance(materials, list):
        materials = [str(materials)]
    materials = [str(m).strip() for m in materials if str(m).strip()]
    all_steps = (data or {}).get("all_steps") or []
    if not isinstance(all_steps, list):
        all_steps = []
    all_steps = [str(s).strip() for s in all_steps if str(s).strip()]

    try:
        step_index = int((data or {}).get("step_index", 0))
    except (TypeError, ValueError):
        step_index = 0
    try:
        total_steps = int((data or {}).get("total_steps") or len(all_steps) or 1)
    except (TypeError, ValueError):
        total_steps = max(1, len(all_steps) or 1)

    step_number = max(1, step_index + 1)
    is_final = step_number >= total_steps
    is_late = total_steps > 1 and step_number >= max(1, total_steps - 1)
    step_lower = step.lower()
    is_optional = "optional" in step_lower or step_lower.startswith("optionally")

    materials_line = ", ".join(materials) if materials else "household craft materials from the project"
    prior_steps = all_steps[:step_index]
    prior_block = "\n".join(f"- {s}" for s in prior_steps) if prior_steps else "- (first step; show only the parts introduced here)"

    stage_rules = []
    if is_optional:
        stage_rules.append(
            "This is an OPTIONAL enhancement. Show the SAME finished project with this optional addition clearly labeled. Do not invent a different object."
        )
    if is_final or is_late:
        stage_rules.append(
            "This is a late/final step. Show the complete finished product of THIS project (overall assembly), like the last pages of a LEGO manual."
        )
    else:
        stage_rules.append(
            "Show the build progress after THIS step only: prior parts already assembled + the new parts added now. Do not jump to an unrelated finished object."
        )

    stage_text = "\n".join(f"- {rule}" for rule in stage_rules)

    prompt = f"""Create ONE clean LEGO-instruction-manual style educational diagram for a DIY engineering build.

PROJECT (must match exactly — never invent a different project):
- Title: {title or "DIY build"}
- Description: {description or "Follow the step carefully."}
- Materials ONLY (draw these materials; do not substitute LEGO bricks, plastic people, or unrelated objects): {materials_line}

CURRENT STEP {step_number} of {total_steps}:
{step}

STEPS ALREADY COMPLETED BEFORE THIS ONE:
{prior_block}

STAGE RULES:
{stage_text}

VISUAL STYLE (LEGO / IKEA manual clarity):
- White background, simple isometric or 3/4 view, soft shadows, crisp outlines
- Large readable labels with thin callout lines pointing to exact parts
- Show WHERE each new piece attaches (left/right, between posts, under deck, etc.)
- Keep the SAME subject and material look across the whole project
- No people, no faces, no characters, no humanoid figures
- No LEGO brick studs unless the project materials are literally LEGO
- No text paragraphs except short labels and a small Step {step_number} heading
- Easy enough for a beginner to follow at a glance

FORBIDDEN:
- Drawing a different project (figurines, unrelated toys, random machines)
- Changing materials mid-build
- Vague “floating” parts with no attachment location
"""

    result = await asyncio.to_thread(
        lambda: client.images.generate(
            model="gpt-image-1",
            prompt=prompt,
            size="1024x1024",
        )
    )

    image_base64 = result.data[0].b64_json
    image_url = f"data:image/png;base64,{image_base64}"
    return {"image_url": image_url}


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
