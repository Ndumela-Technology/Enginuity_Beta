from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Optional

from core.ai_engine import generate_projects
from core.forge_ai_helper import forge_chat

app = FastAPI()


# ------------------------
# Request Models
# ------------------------

class ChatRequest(BaseModel):
    mode: str
    message: str
    history: List[dict] = []
    memory: Optional[dict] = None


class ProjectRequest(BaseModel):
    description: str


# ------------------------
# Routes
# ------------------------

@app.get("/")
def root():
    return {"status": "ForgeAI backend running"}


@app.post("/chat")
def chat(request: ChatRequest):

    # Ensure message is always a string
    message = request.message or ""

    # Clean history (remove bad messages)
    clean_history = []
    for msg in request.history:
        if msg.get("content") is not None:
            clean_history.append(msg)

    reply = forge_chat(
        request.mode,
        clean_history,
        message,
        request.memory
    )

    return {"reply": reply}


@app.post("/generate-project")
def generate_project(request: ProjectRequest):

    projects = generate_projects(request.description)

    return {"projects": projects}

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)