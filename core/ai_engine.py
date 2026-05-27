import os
from openai import OpenAI
import json
from dotenv import load_dotenv, find_dotenv
from prompt.prompts import SYSTEM_PROMPT

# Load .env
load_dotenv(find_dotenv())

# Check it's loaded
print("DEBUG: OPENAI_API_KEY =", os.getenv("OPENAI_API_KEY"))

# Only create client after loading env
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def _extract_first_json_object(text: str):
    """
    Best-effort: pull the first JSON object from a string.
    Handles cases where the model accidentally adds extra text.
    """
    if not text:
        raise json.JSONDecodeError("Empty response", "", 0)

    start = text.find("{")
    if start == -1:
        raise json.JSONDecodeError("No JSON object start found", text, 0)

    decoder = json.JSONDecoder()
    obj, _ = decoder.raw_decode(text[start:])
    return obj


def generate_projects(input_data):
    # -----------------------------------
    # Normalize input into chat messages
    # -----------------------------------
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": input_data}
    ]

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.7,
            response_format={"type": "json_object"}
        )

        content = (response.choices[0].message.content or "").strip()
        return _extract_first_json_object(content)

    except json.JSONDecodeError:
        return {"error": "AI response was not valid JSON. Try again."}

    except Exception as e:
        return {"error": str(e)}


def generate_chat_reply(messages):
    """
    Pure conversational replies (chat system)
    """

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.7
        )

        return response.choices[0].message.content.strip()

    except Exception as e:
        return f"Error: {str(e)}"


def generate_innovator_lite_project(materials):
    """
    Generates a single first-time onboarding project (Innovator Lite).
    """
    materials_list = [str(m).strip() for m in (materials or []) if str(m).strip()]
    materials_text = ", ".join(materials_list) if materials_list else "paper, tape, and a cup"

    system_prompt = (
        "You are SparkAI creating a first-impression onboarding build for Enginuity.\n"
        "Return ONLY valid JSON with exactly these keys:\n"
        "{\n"
        '  "title": "",\n'
        '  "description": "",\n'
        '  "estimated_time": "",\n'
        '  "difficulty": "",\n'
        '  "materials": [],\n'
        '  "steps": [],\n'
        '  "science_explanation": ""\n'
        "}\n\n"
        "Rules:\n"
        "- Beginner-friendly only\n"
        "- Use only provided materials\n"
        "- Build time must be 15-20 minutes max\n"
        "- Safe, realistic, visually interesting, satisfying to complete\n"
        "- 4 to 7 concise numbered steps\n"
        "- Fun immediately, wow factor, no dangerous actions\n"
        "- No external purchases\n"
        "- Avoid technical jargon\n"
    )

    user_prompt = (
        "Create one Innovator Lite project.\n"
        f"Available materials: {materials_text}\n"
        "Reminder: return JSON only."
    )

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.6,
            response_format={"type": "json_object"},
        )
        content = (response.choices[0].message.content or "").strip()
        return _extract_first_json_object(content)
    except json.JSONDecodeError:
        return {"error": "AI response was not valid JSON. Try again."}
    except Exception as e:
        return {"error": str(e)}

def run_safety_check(project_data):
    """
    Checks projects for safety and injects warnings if needed.
    """

    safety_prompt = [
        {
            "role": "system",
            "content": (
                "You are a strict but practical engineering safety inspector.\n\n"
                "Analyze the project and classify risk level:\n"
                "- LOW: safe with minor risks\n"
                "- MEDIUM: needs caution and warnings\n"
                "- HIGH: dangerous and should be blocked\n\n"
                "Respond in JSON:\n"
                "{\n"
                "  \"risk_level\": \"LOW\" | \"MEDIUM\" | \"HIGH\",\n"
                "  \"warnings\": [list of safety concerns],\n"
                "  \"fix\": \"only if HIGH risk\"\n"
                "}\n\n"
                "IMPORTANT:\n"
                "- DO NOT mark simple materials (cardboard, glue, tape) as HIGH risk\n"
                "- Small risks like scissors or falling objects are LOW or MEDIUM\n"
                "- Only mark HIGH if there is serious danger (fire, explosion, toxic chemicals, high voltage)\n"
            )
        },
        {
            "role": "user",
            "content": json.dumps(project_data)
        }
    ]

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=safety_prompt,
            temperature=0,
            response_format={"type": "json_object"}
        )

        content = (response.choices[0].message.content or "").strip()
        safety_result = _extract_first_json_object(content)

        # -------------------------------
        # Handle Safety Levels
        # -------------------------------
        risk = safety_result.get("risk_level", "LOW")

        if risk == "HIGH":
            return {
                "error": "⚠️ Project deemed unsafe",
                "details": safety_result.get("warnings", []),
                "suggestion": safety_result.get("fix", "")
            }

        # LOW or MEDIUM → allow, just add warnings
        project_data["safety_warnings"] = safety_result.get("warnings", [])
        return project_data

    except Exception as e:
        return {"error": str(e)}




