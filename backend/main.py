from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Optional
from core.ai_engine import generate_projects, generate_chat_reply, run_safety_check
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI

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
    mode: str
    history: List[dict] = []
    education: Optional[str] = None


# ------------------------
# Routes
# ------------------------

@app.get("/")
def root():
    return {"status": "Enginuity API — SparkAI ready"}


@app.post("/chat")
def chat(request: ChatRequest):

    messages = []

    # -------------------------------
    # 1. System Prompt (mode-based)
    # -------------------------------
    system_prompt = personality_layer(request.mode, request.education)
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