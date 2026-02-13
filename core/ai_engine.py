import os
import json
from openai import OpenAI
from dotenv import load_dotenv, find_dotenv
from prompts import SYSTEM_PROMPT

# Load API key
_ = load_dotenv(find_dotenv())

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def generate_project(user_description):
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_description}
            ],
            temperature=0.7
        )

        content = response.choices[0].message.content

        # Convert AI response (JSON string) into Python dictionary
        project_data = json.loads(content)

        return project_data

    except json.JSONDecodeError:
        return {"error": "AI response was not valid JSON. Try again."}

    except Exception as e:
        return {"error": str(e)}

