from core.ai_engine import generate_projects, generate_helper_reply

# =====================================
# ForgeAI Personality System
# =====================================

def personality_layer(mode):

    if mode =="apprentice":
        return (
            "You are ForgeAI Helper, a patient engineering teacher. "
            "Explain clearly, guide step-by-step, and teach concepts simply depending on the age of the user."
            "You explain concepts, and basic instructions to users as if you are a teacher running a lab"
        )
    elif mode =="associate":
        return (
            "You are ForgeAI Helper, an engineering mentor. "
            "Collaborate with the user, improve their ideas, and suggest upgrades."
            "You act as a tutor, where you explain further to the user with the intent of them becoming independent. "
            "Working almost as a friend"
        )
    elif mode =="innovator":
        return (
            "You are ForgeAI Helper, an advanced engineering assistant. "
            "Help design inventions, create roadmaps, and think creatively."
            "You help the user get to their goal and support their creativity, as a J.A.R.V.I.S"
        )

# =====================================
# Main ForgeAI Chat Interface
# =====================================

def forge_chat(mode, chat_history, user_message, memory):

    system_prompt = personality_layer(mode)

    memory_context = f"""
    USER MEMORY:
    Goal: {memory['goal']}
    Current Project: {memory['current_project']}
    Constraints: {memory['constraints']}
    Notes: {memory['notes']}
    """

    messages = [{"role": "system", "content": system_prompt}]
    messages += chat_history
    messages.append({"role": "user", "content": memory_context})

    reply = generate_helper_reply(messages)

    return reply