from fastapi import FastAPI, Request
from pydantic import BaseModel
from typing import List, Optional
from core.ai_engine import generate_projects, generate_chat_reply, run_safety_check, generate_innovator_lite_project
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # allow all for now (MVP)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = OpenAI()

def safety_critic_check(project_text):

    response = client.responses.create(
        model="gpt-4o-mini",
        input=[
            {
                "role": "system",
                "content": """
You are a strict SAFETY ENGINEER.

Analyze the given engineering project for:
- electrical risks (short circuits, overheating, batteries)
- chemical risks
- dangerous material combinations
- fire hazards
- risk of injury

Rules:
- If SAFE → respond ONLY with: SAFE
- If NOT SAFE → explain danger + suggest safer alternative
                """
            },
            {
                "role": "user",
                "content": project_text
            }
        ]
    )

    return response.output_text


#-------------------------
# Personality
#-------------------------
def personality_layer(mode: str, education: str = None, age_group: str = None):
    # Core identity (stable foundation)
    instructions = [
        "You are SparkAI, the assistant on Enginuity — you help users learn, build, and create safe engineering projects."
    ]

    # --------------------------nd-
    # 1. ROLE / MODE (MOST IMPORTANT)
    # -----------------------------
    mode_rules = {
        "Apprentice": [
            "You fully guide the user step-by-step.",
            "Break everything into small, simple steps.",
            "Do not assume prior knowledge."
        ],

        "Associate": [
            "You collaborate with the user.",
            "Offer suggestions, but let the user modify decisions.",
            "Balance guidance with independence."
        ],

        "Innovator": [
            "The user leads the project.",
            "You act as a technical assistant and idea enhancer.",
            "Avoid over-explaining unless asked."
        ]
    }

    if mode in mode_rules:
        instructions.extend(mode_rules[mode])

    # -----------------------------
    # 2. EDUCATION LEVEL (COMPLEXITY CONTROL)
    # -----------------------------
    education_rules = {
        "Middle-Schooler(10-14 years old)🖍️": [
            "Use very simple explanations.",
            "Prefer short steps and visual/real-life examples."
        ],

        "High-Schooler(15-18 years old)🏫": [
            "Use moderate detail and structured explanations.",
            "Include practical examples."
        ],

        "Student(18-25 years old)🎓": [
            "Assume good basic understanding.",
            "Allow deeper explanations when useful."
        ],

        "Adult": [
            "Be concise and efficient.",
            "Focus on clarity and practicality."
        ]
    }

    if education in education_rules:
        instructions.extend(education_rules[education])

    # -----------------------------
    # 3. TONE (AGE-BASED COMMUNICATION STYLE)
    # -----------------------------
    tone_rules = {
        "child": "Use a very friendly, encouraging tone.",
        "teen": "Keep tone friendly and engaging.",
        "adult": "Keep tone professional but clear."
    }

    if age_group in tone_rules:
        instructions.append(tone_rules[age_group])

    # -----------------------------
    # FINAL OUTPUT
    # -----------------------------
    return " ".join(instructions)

# -------------------------------
# Helper Functions
# -------------------------------
def is_dangerous_input(text: str):
    dangerous_keywords = [
        # Explosives / weapons
        "bomb", "explosive", "gunpowder", "detonator",

        # Toxic combinations
        "bleach and ammonia", "toxic gas", "chlorine gas",

        # Harm intent
        "poison", "acid attack",

        # Strong chemicals (keep minimal)
        "sulfuric acid", "nitric acid",

        # Fire-related (ONLY extreme cases)
        "how to start a fire indoors", "arson"
    ]

    text_lower = text.lower()

    for keyword in dangerous_keywords:
        if keyword in text_lower:
            return True

    return False

# ------------------------
# Request Models
# ------------------------

class ProjectRequest(BaseModel):
    description: str
    difficulty: str = "beginner"
    age: str = ""
    materials: str = ""

class ChatRequest(BaseModel):
    message: str
    context: str = ""
    history: List[dict] = []
    education: Optional[str] = None
    mode: str = "Innovator"


class InnovatorLiteRequest(BaseModel):
    materials: List[str] = []


# ------------------------
# Routes
# ------------------------

@app.get("/")
def root():
    return {"status": "Enginuity API — SparkAI ready"}


@app.get("/public-config/contact")
def public_contact_config():
    email = (os.getenv("CONTACT_EMAIL", "") or "").strip()
    return {"email": email}


@app.post("/chat-innovator")
def chat(request: ChatRequest):

    messages = []

    # -------------------------------
    # 1. System Prompt (mode-based)
    # -------------------------------
    system_prompt = personality_layer(request.mode, request.education)
    if request.context and request.context.strip():
        system_prompt = f"{system_prompt}\n\nUser context:\n{request.context.strip()}"
    messages.append({"role": "system", "content": system_prompt})

    # -------------------------------
    # 2. Chat History
    # -------------------------------
    for msg in request.history:
        if msg.get("content"):  # prevents null errors
            messages.append(msg)

    # -------------------------------
    # 3. Current User Message
    # -------------------------------
    messages.append({
        "role": "user",
        "content": request.message
    })

    # -------------------------------
    # 4. Generate Reply
    # -------------------------------
    reply = generate_chat_reply(messages)

    # -----------------------------
    # 5. Return Clean Response
    # -------------------------------
    return {"reply": reply}

@app.post("/generate-project")
def generate_project(request: ProjectRequest):

    # -------------------------------
    # 1. Input Safety Check
    # -------------------------------
    if is_dangerous_input(request.description):
        return {
            "error": "⚠️ This request may be unsafe. Please try a different project idea."
        }

    # -------------------------------
    # 2. Generate Projects
    # -------------------------------
    full_input = f"""
    Project idea: {request.description}

    User difficulty level: {request.difficulty}
    User age: {request.age}
    Available materials: {request.materials}

    Generate suitable engineering projects based on this.
    """


    projects = generate_projects(full_input)

    # -------------------------------
    # 3. Output Safety Check
    # -------------------------------
    safe_projects = run_safety_check(projects)

    return {"projects": safe_projects}


@app.post("/generate-innovator-lite")
def generate_innovator_lite(request: InnovatorLiteRequest):
    materials = request.materials or []
    if not isinstance(materials, list):
        return {"error": "Materials must be a list of strings."}

    normalized_materials = [str(m).strip() for m in materials if str(m).strip()]
    if not normalized_materials:
        return {"error": "Please provide at least one material."}

    generated = generate_innovator_lite_project(normalized_materials)
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
        "materials": [str(m).strip() for m in generated.get("materials", []) if str(m).strip()],
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


@app.post("/chat-helper")
def spark_helper(data: ChatRequest):
    context = (data.context or "").strip()
    message = (data.message or "").strip()
    mode = (data.mode or "Apprentice").strip()

    mode_guidance = {
        "Apprentice": "Use simple, step-by-step language. Do not assume prior knowledge.",
        "Associate": "Collaborate: suggest options and trade-offs; support the user's choices.",
        "Innovator": "Be concise; the user leads. Answer directly without over-explaining.",
        "Innovator Lite": "Keep it welcoming, simple, and motivating for a first-time builder.",
    }.get(mode, "Explain clearly for a learning builder.")

    system_prompt = f"""You are SparkHelper, an engineering mentor and educational assistant inside Enginuity.

The user is in {mode} mode. {mode_guidance}

You help the user with their CURRENT project only (provided below).

You should:
- Explain concepts clearly
- Help improve existing builds
- Discuss related engineering ideas in context
- Compare designs and principles
- Encourage experimentation and learning

You should NOT:
- Generate entirely new standalone projects
- Replace SparkAI's project generator
- Create unrelated build plans

If the user asks for a completely new project or an unrelated build:
- Redirect them naturally to use SparkAI's project generator on their mode page
- Offer to help explore or improve ideas within their current project instead

Reply in clear plain language. Avoid markdown headings (#). Use short paragraphs or simple bullet lists when helpful.

Current project context:
{context if context else "(No project context provided.)"}
"""

    messages = [{"role": "system", "content": system_prompt}]

    for msg in data.history or []:
        role = msg.get("role")
        content = msg.get("content")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})

    messages.append({"role": "user", "content": message})

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages,
    )

    reply = response.choices[0].message.content

    return {"reply": reply}

@app.post("/generate-diagram")
def generate_diagram(data: dict):
    step = data["step"]

    prompt = f"""
    A clean, simple educational diagram of this step:

    {step}

    Style:
    - white background
    - minimal design
    - labeled parts
    - instructional like a LEGO manual
    """

    result = client.images.generate(
        model="gpt-image-1",
        prompt=prompt,
        size="1024x1024"
    )

    image_base64 = result.data[0].b64_json

    # Convert to usable format for frontend
    image_url = f"data:image/png;base64,{image_base64}"

    return {"image_url": image_url}