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




