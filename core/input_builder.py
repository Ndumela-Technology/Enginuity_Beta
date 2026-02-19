
def build_user_description(topic, education, difficulty, materials):
    """
    Builds a clean, standardized description
    that gets sent to the AI engine.
    """

    description = f"""
    Topic: {topic}

    Education Level:
    {education}

    Desired Difficulty / Time:
    {difficulty}

    Materials Available at Home:
    {materials}

    The project must:
    - Match the user's education level
    - Respect the available materials
    - Be safe and beginner-friendly
    - Be buildable at home
    """

#Physics lecture logic
    if "High Schooler" in education:
        description += "\nInclude a brief high-school level physics explanation."
    elif "Student" in education:
        description += "\nInclude a university-level physics explanation."
    elif "Adult" in education:
        description += "\nInclude a more technical physics explanation."

    return description