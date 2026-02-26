import os
from openai import OpenAI
import json
from dotenv import load_dotenv, find_dotenv
from prompts import SYSTEM_PROMPT

# Load .env
load_dotenv(find_dotenv())

# Check it's loaded
print("DEBUG: OPENAI_API_KEY =", os.getenv("OPENAI_API_KEY"))

# Only create client after loading env
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def generate_project(input_data, chat_mode=False):
    # -----------------------------------
    # Normalize input into chat messages
    # -----------------------------------
    if chat_mode:
        messages = input_data  # already formatted chat messages
    else:
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": input_data}
        ]

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.7,
            response_format={"type": "json_object"} if not chat_mode else None
        )

        content = response.choices[0].message.content.strip()

        # JSON projects mode
        if not chat_mode:
            start = content.find("{")
            end = content.rfind("}") + 1
            content = content[start:end]
            project_data = json.loads(content)
            return project_data

        # Chat mode → return raw reply
        return content

    except json.JSONDecodeError:
        return {"error": "AI response was not valid JSON. Try again."}

    except Exception as e:
        return {"error": str(e)}

def generate_chat_project(messages):

    try:
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.7
        )

        reply = completion.choices[0].message.content

        return {"reply": reply}

    except Exception as e:
        return {"reply": f"Error: {str(e)}"}




