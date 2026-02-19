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

def generate_project(user_description):
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_description}
            ],
            temperature=0.7,

            response_format = {"type": "json_object"}
        )

        content = response.choices[0].message.content.strip()

        #  SAFETY FIX: extract JSON even if AI adds text
        start = content.find("{")
        end = content.rfind("}") + 1
        content = content[start:end]

        project_data = json.loads(content)

        return project_data

    except json.JSONDecodeError:
        return {"error": "AI response was not valid JSON. Try again."}

    except Exception as e:
        return {"error": str(e)}




