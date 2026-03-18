from core.ai_engine import generate_projects
import streamlit as st

# =====================================
# ForgeAI Personality System
# =====================================

def personality_layer(mode, education=None):

    age_group = st.session_state.get("age_group", "University")

    if mode == "apprentice":

        if education and "Middle-Schooler" in education:
            return """
    You are ForgeAI.
    Explain using very simple words.
    Maximum 3 short sentences.
    No technical vocabulary.
    """

        elif education and "High-Schooler" in education:
            return """
    You are ForgeAI.
    Explain clearly with light technical words.
    Keep answers under 6 sentences.
    """

        else:
            return """
    You are ForgeAI.
    Explain with correct engineering terminology.
    Encourage deeper thinking.
    """

# =====================================
# Main ForgeAI Chat Interface
# =====================================

def forge_chat(mode, chat_history, user_message, memory=None, education=None):

    if user_message is None:
        return "I didn't receive a message. Please try again."

    system_prompt = personality_layer(mode, education)

    # Inject memory into system context
    if memory:
        memory_context = f"""
        Current Project: {memory.get('current_project', '')}
        User Goal: {memory.get('goal', '')}
        Notes: {memory.get('notes', [])}
        """

        system_prompt += "\n\n" + memory_context

    messages = []


    if system_prompt:
        messages.append({
            "role": "system",
            "content": str(system_prompt)
        })


    for msg in chat_history:
        if msg.get("content") is not None:
            messages.append({
                "role": msg.get("role", "user"),
                "content": str(msg["content"])
            })


    if user_message:
        messages.append({
            "role": "user",
            "content": str(user_message)
        })

    reply = generate_projects(messages, chat_mode=True)

    return reply