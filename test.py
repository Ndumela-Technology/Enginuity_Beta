# test.py
from pathlib import Path
from dotenv import load_dotenv
import os
from core.ai_engine import generate_project

# -----------------------------
# Load .env from project root
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(env_path)

# Check if API key is loaded
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    print("❌ OPENAI_API_KEY not found. Check your .env file.")
    exit()
print("✅ API Key loaded successfully!")

# -----------------------------
# Dummy user input for testing
user_description = """
Topic: Aerospace
Age group: High schooler
Difficulty: Easy
Materials: balloon, tape, string, straw
"""

# -----------------------------
# Call the AI engine
project = generate_project(user_description)

# -----------------------------
# Print the output
print("\n🔧 Test Project Output:\n")
if "error" in project:
    print("⚠️ Error:", project["error"])
else:
    print("Project Name:", project.get("project_name"))
    print("Description:", project.get("description"))
    print("Materials Needed:", project.get("materials_needed"))
    print("Steps:", project.get("steps"))
    print("What You Learn:", project.get("what_you_learn"))
    print("Difficulty:", project.get("difficulty"))


