import asyncio
import json
import os
from typing import List, Optional

from dotenv import find_dotenv, load_dotenv

load_dotenv(find_dotenv())

import httpx
from fastapi import FastAPI
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
        generate_innovator_lite_project, normalized_materials
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
    step = data["step"]

    prompt = (
        f"Clean educational diagram for this build step:\n{step}\n"
        "Style: white background, minimal, labeled parts, LEGO-manual clarity."
    )

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
