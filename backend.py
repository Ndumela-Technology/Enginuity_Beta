from fastapi import FastAPI
from pydantic import BaseModel

from core.ai_engine import generate_projects
from core.forge_ai_helper import forge_chat

app = FastAPI()


class ChatRequest(BaseModel):
    mode: str
    message: str
    history: list


@app.post("/chat")
def chat(request: ChatRequest):

    reply = forge_chat(
        request.mode,
        request.history,
        request.message
    )

    return {"reply": reply}


@app.post("/generate-project")
def generate_project(data: dict):

    projects = generate_projects(data["description"])

    return projects