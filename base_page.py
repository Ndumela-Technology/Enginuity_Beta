import streamlit as st
from core.input_builder import build_user_description
from core.ai_engine import generate_projects
import re
from core.forge_ai_helper import forge_chat

if "generated" not in st.session_state:
    st.session_state.generated = False

if "helper_chat" not in st.session_state:
    st.session_state.helper_chat = []

if "projects" not in st.session_state:
    st.session_state.projects = None

if "selected_project" not in st.session_state:
    st.session_state.selected_project = 0

if "chat_history" not in st.session_state:
    st.session_state.chat_history = []

if "chat_messages" not in st.session_state:
    st.session_state.chat_messages = []

if "project_board" not in st.session_state:
    st.session_state.project_board = []

if "apprentice_state" not in st.session_state:
    st.session_state.apprentice_state = {
        "generated": False,
        "projects": None,
        "selected_project": 0,
        "chat": []
    }

if "associate_state" not in st.session_state:
    st.session_state.associate_state = {
        "generated": False,
        "projects": None,
        "selected_project": 0,
        "chat": []
    }
# Safety fallback
if st.session_state.associate_state.get("projects") is None:
    st.session_state.associate_state["projects"] = []

if "innovator_state" not in st.session_state:
    st.session_state.innovator_state = {
        "chat": []
    }


with st.expander("📂 Project Board"):
    if not st.session_state.project_board:
        st.caption("No saved projects yet.")
    else:
        for i, saved_proj in enumerate(st.session_state.project_board):

            st.markdown(f"### {saved_proj['project_name']}")
            st.write(saved_proj["description"])

            col1, col2 = st.columns(2)

            if col1.button("Open", key=f"open_{i}"):
                st.session_state.projects = [saved_proj]
                st.session_state.selected_project = 0
                st.session_state.generated = True
                st.rerun()

            if col2.button("Remove", key=f"remove_{i}"):
                st.session_state.project_board.pop(i)
                st.rerun()

if "forge-memory" not in st.session_state:
    st.session_state.forge_memory = {
        "goal": "",
        "current_project": "",
        "constraints": "",
        "notes": []
    }

def render_physics_explanation(text):
    """
    Renders markdown normally,
    but displays $$ LaTeX $$ formulas
    as large centered equations.
    """

    # Split text into parts: normal text and LaTeX blocks
    parts = re.split(r"(\$\$.*?\$\$)", text, flags=re.DOTALL)

    for part in parts:
        if part.startswith("$$") and part.endswith("$$"):
            # Remove $$ symbols
            formula = part.strip("$")
            st.latex(formula)
        else:
            st.markdown(part)

def show_base_page(topic):

    global project_response
    st.title(topic)

    # ------------------------
    # Experience Mode (MAIN APP ARCHITECTURE)
    experience = st.segmented_control(
        "Choose your path  :",
        [
            "Apprentice🌱",
            "Associate🧩",
            "Innovator💡"
        ]
    )

    # =========================================================
    # APPRENTICE 🌱
    # =========================================================
    if experience == "Apprentice🌱":
            st.subheader("Learning Phase")
            st.caption("Have ForgeAI teach you the basics to become your own engineer.")

            # ------------------------
            # Difficulty settings
            education = st.selectbox(
                "What form of education do you have?",
                [
                    "Middle-Schooler(10-14 years old)🖍️",
                    "High-Schooler(15-18 years old)🏫",
                    "Student(18-25 years old)🎓",
                    "Adult(25+ years old)🧔🏻"
                ]
            )

            if education == "Middle-Schooler(10-14 years old)🖍️":
                difficulty = st.selectbox("What difficulty do you want?",
                                          ["Easy: 5–10 min", "Medium: 15–30 min", "Hard: 30–45 min"])
            elif education == "High-Schooler(15-18 years old)🏫":
                difficulty = st.selectbox("What difficulty do you want?",
                                          ["Easy: 10–30 min", "Medium: 45–60 min", "Hard: 60–90 min"])
            elif education == "Student(18-25 years old)🎓":
                difficulty = st.selectbox("What difficulty do you want?",
                                          ["Easy: 30–60 min", "Medium: 60–120 min", "Hard: 2 days–1 week"])
            else:  # Adult
                difficulty = st.selectbox("What difficulty do you want?",
                                          ["Easy: 30–60 min", "Medium: 60–180 min", "Hard: 5 days–2 weeks"])

            # ------------------------
            # Materials selector
            materials = st.text_area(
                "What materials do you have at home?",
                placeholder="Example: cardboard, tape, plastic bottle, DC motor..."
            )

            # ------------------------
            # Generate button
            project_response = None  # initialize so it exists in the scope

            if st.button(f"Generate {topic} Project"):
                # Add physics/technical lecture for high school+ ages
                if education == "High-Schooler(15-18 years old)🏫":
                    lecture_level = "brief, high-school physics explanation"
                elif education == "Student(18-25 years old)🎓":
                    lecture_level = "detailed, university-level physics explanation"
                elif education == "Adult(25+ years old)🧔🏻":
                    lecture_level = "technical physics lecture with more complex formulas"
                else:  # Middle Schooler
                    lecture_level = "simple, beginner-friendly physics explanation"

                # Build user description with 3 project request
                user_description = build_user_description(
                    topic=topic,
                    education=education,
                    difficulty=difficulty,
                    materials=materials
                )
                user_description += f"\nInclude a {lecture_level} level explanation for the project."

                user_description += """
                    Please create 3 different project options in VALID JSON ONLY.

                    IMPORTANT RULES:
                    - Return ONLY JSON.
                    - Do NOT include markdown, comments, or extra text.
                    - The response must start with { and end with }.
                    - All strings must use double quotes.
                    - Ensure the JSON is parseable with json.loads().

                    Return a JSON object with a single key "projects",
                    which contains a list of exactly 3 project objects.

                    Each project object MUST include:

                    - project_name (string)
                    - description (string)
                    - materials_needed (array of strings)
                    - materials_suggested (array of strings, optional cheap upgrades)
                    - engineering_explanation (string)
                    - physics_explanation (string, include formulas when relevant)
                    - steps (EITHER:
                          a simple array of strings
                          OR
                          an object where keys are section titles and values are arrays of steps)

                    Example format:

                    {
                      "projects": [
                        {
                          "project_name": "Balloon Rocket",
                          "description": "A fun experiment demonstrating thrust.",
                          "materials_needed": ["balloon", "straw", "tape"],
                          "materials_suggested": ["measuring tape", "lighter balloon"],
                          "engineering_explanation": "Engineers analyze thrust-to-mass ratio...",
                          "physics_explanation": "Newton's Third Law explains motion. <div class=\\"formula\\">F = m × a</div>",
                          "steps": [
                            "Thread the straw onto a string.",
                            "Attach balloon with tape.",
                            "Release and observe motion."
                          ]
                        }
                      ]
                    }

                    Additional Instruction (Educational Formatting):

                    Adapt how physics explanations are presented depending on lecture level:

                    - For "Middle School" and "High School":
                        • Integrate short physics explanations directly INTO the steps.
                        • Integrate physics formulas for "High School" within the physics explanations.
                        • Steps should briefly explain WHY something happens while the user performs it.
                        • Keep explanations simple and intuitive.
                        • The physics_explanation section should still exist, but act as a short summary.

                    - For "University" and "Adult":
                        • Keep steps focused only on actions.
                        • Place detailed physics and engineering explanations AFTER the steps.
                        • Use formulas and deeper technical reasoning in the physics_explanation section.

                    IMPORTANT:
                    Do not change the JSON structure.
                    Only adapt HOW explanations are written.

                    """

                # Call AI engine
                with st.spinner("Creating Your Project...💭"):
                    project_response = generate_projects(user_description)

                if "error" not in project_response:
                    st.session_state.projects = project_response["projects"]
                    st.session_state.generated = True
                    st.session_state.apprentice_state["projects"] = project_response["projects"]
                    st.session_state.apprentice_state["generated"] = True
                else:
                    st.error(project_response["error"])

            if st.session_state.generated and st.session_state.projects:

                state = st.session_state.apprentice_state

                project_names = [
                    f"{i + 1}. {proj['project_name']}"
                    for i, proj in enumerate(state["projects"])
                ]

                selected_project_name = st.selectbox(
                    "Choose a project to explore:",
                    project_names,
                    index=st.session_state.selected_project,
                    key="project_selector_apprentice"
                )

                st.session_state.selected_project = project_names.index(selected_project_name)
                proj = state["projects"][st.session_state.selected_project]

                # ------------------------
                # Project Title + Description
                st.header(proj["project_name"])
                st.write(proj["description"])

                # ------------------------
                # Materials Needed
                st.subheader("🧰 Materials Needed")
                for item in proj["materials_needed"]:
                    st.write("-", item)

                # ------------------------
                # Suggested Materials (NEW)
                if "materials_suggested" in proj and proj["materials_suggested"]:
                    st.subheader("🛒 Suggested Upgrades (Optional)")
                    st.caption("Cheap household items you could buy to improve the project.")
                    for item in proj["materials_suggested"]:
                        st.write("-", item)

                # ------------------------
                # Physics Explanation
                st.subheader("🧪 Physics Explanation")
                render_physics_explanation(proj["physics_explanation"])

                # ------------------------
                # Steps
                st.subheader("🛠️ Build Steps")

                steps = proj["steps"]

                if isinstance(steps, list):
                    for i, step in enumerate(steps, 1):
                        st.write(f"{i}. {step}")

                elif isinstance(steps, dict):
                    for section, section_steps in steps.items():
                        st.markdown(f"### {section}")
                        for i, step in enumerate(section_steps, 1):
                            st.write(f"{i}. {step}")

            # =========================================================
            # ForgeAI Helper (Apprentice Mini Assistant)
            # =========================================================
            st.divider()
            st.subheader("🧠 ForgeAI Helper")

            # Show previous helper messages
            for msg in st.session_state.helper_chat:
                with st.chat_message(msg["role"]):
                    st.markdown(msg["content"])

            helper_input = st.chat_input(
                "Stuck? Ask ForgeAI for help..."
            )

            if helper_input:
                # Save user message
                st.session_state.helper_chat.append(
                    {"role": "user", "content": helper_input}
                )

                with st.chat_message("user"):
                    st.markdown(helper_input)

                # Call ForgeAI in apprentice personality
                ai_reply = forge_chat(
                    "apprentice",
                    st.session_state.chat_messages,
                    helper_input,
                    st.session_state.forge_memory
                )

                st.session_state.helper_chat.append(
                    {"role": "assistant", "content": ai_reply}
                )

                with st.chat_message("assistant"):
                    st.markdown(ai_reply)

            if st.session_state.generated and st.session_state.projects:
                if st.button("⭐ Save to Project Board"):
                    proj = st.session_state.projects[st.session_state.selected_project]
                    if proj not in st.session_state.project_board:
                        st.session_state.project_board.append(proj)
                        st.success("Project saved!")
                    else:
                        st.info("Project already saved.")



    # =========================================================
    # ASSOCIATE🧩
    # =========================================================
    elif experience == "Associate🧩":

            st.subheader("Development Phase")
            st.caption("From basic instructor to you personal engineering tutor.")

            # ------------------------
            # Difficulty settings
            education = st.selectbox(
                "What form of education do you have?",
                [
                    "Middle-Schooler(10-14 years old)🖍️",
                    "High-Schooler(15-18 years old)🏫",
                    "Student(18-25 years old)🎓",
                    "Adult(25+ years old)🧔🏻"
                ]
            )

            if education == "Middle-Schooler(10-14 years old)🖍️":
                difficulty = st.selectbox("What difficulty do you want?",
                                          ["Easy: 5–10 min", "Medium: 15–30 min", "Hard: 30–45 min"])
            elif education == "High-Schooler(15-18 years old)🏫":
                difficulty = st.selectbox("What difficulty do you want?",
                                          ["Easy: 10–30 min", "Medium: 45–60 min", "Hard: 60–90 min"])
            elif education == "Student(18-25 years old)🎓":
                difficulty = st.selectbox("What difficulty do you want?",
                                          ["Easy: 30–60 min", "Medium: 60–120 min", "Hard: 2 days–1 week"])
            else:  # Adult
                difficulty = st.selectbox("What difficulty do you want?",
                                          ["Easy: 30–60 min", "Medium: 60–180 min", "Hard: 5 days–2 weeks"])

            # ------------------------
            # Materials selector
            materials = st.text_area(
                "What materials do you have at home?",
                placeholder="Example: cardboard, tape, plastic bottle, DC motor..."
            )

            # ------------------------
            # Generate button
            project_response = None  # initialize so it exists in the scope

            if st.button(f"Generate {topic} Project"):
                # Add physics/technical lecture for high school+ ages
                if education == "High-Schooler(15-18 years old)🏫":
                    lecture_level = "brief, high-school physics explanation"
                elif education == "Student(18-25 years old)🎓":
                    lecture_level = "detailed, university-level physics explanation"
                elif education == "Adult(25+ years old)🧔🏻":
                    lecture_level = "technical physics lecture with more complex formulas"
                else:  # Middle Schooler
                    lecture_level = "simple, beginner-friendly physics explanation"

                # Build user description with 3 project request
                user_description = build_user_description(
                    topic=topic,
                    education=education,
                    difficulty=difficulty,
                    materials=materials
                )
                user_description += f"\nInclude a {lecture_level} level explanation for the project."

                user_description += """
                    Please create 3 different project options in VALID JSON ONLY.

                    IMPORTANT RULES:
                    - Return ONLY JSON.
                    - Do NOT include markdown, comments, or extra text.
                    - The response must start with { and end with }.
                    - All strings must use double quotes.
                    - Ensure the JSON is parseable with json.loads().

                    Return a JSON object with a single key "projects",
                    which contains a list of exactly 3 project objects.

                    Each project object MUST include:

                    - project_name (string)
                    - description (string)
                    - materials_needed (array of strings)
                    - materials_suggested (array of strings, optional cheap upgrades)
                    - engineering_explanation (string)
                    - physics_explanation (string, include formulas when relevant)
                    - steps (EITHER:
                          a simple array of strings
                          OR
                          an object where keys are section titles and values are arrays of steps)

                    Example format:

                    {
                      "projects": [
                        {
                          "project_name": "Balloon Rocket",
                          "description": "A fun experiment demonstrating thrust.",
                          "materials_needed": ["balloon", "straw", "tape"],
                          "materials_suggested": ["measuring tape", "lighter balloon"],
                          "engineering_explanation": "Engineers analyze thrust-to-mass ratio...",
                          "physics_explanation": "Newton's Third Law explains motion. <div class=\\"formula\\">F = m × a</div>",
                          "steps": [
                            "Thread the straw onto a string.",
                            "Attach balloon with tape.",
                            "Release and observe motion."
                          ]
                        }
                      ]
                    }

                    Additional Instruction (Educational Formatting):

                    Adapt how physics explanations are presented depending on lecture level:

                    - For "Middle School" and "High School":
                        • Integrate short physics explanations directly INTO the steps.
                        • Integrate physics formulas for "High School" within the physics explanations.
                        • Steps should briefly explain WHY something happens while the user performs it.
                        • Keep explanations simple and intuitive.
                        • The physics_explanation section should still exist, but act as a short summary.

                    - For "University" and "Adult":
                        • Keep steps focused only on actions.
                        • Place detailed physics and engineering explanations AFTER the steps.
                        • Use formulas and deeper technical reasoning in the physics_explanation section.

                    IMPORTANT:
                    Do not change the JSON structure.
                    Only adapt HOW explanations are written.

                    """

                # Call AI engine
                with st.spinner("Creating Your Project...💭"):
                    project_response = generate_projects(user_description)

                if "error" not in project_response:
                    st.session_state.projects = project_response["projects"]
                    st.session_state.generated = True
                    st.session_state.apprentice_state["projects"] = project_response["projects"]
                    st.session_state.apprentice_state["generated"] = True
                else:
                    st.error(project_response["error"])

            if st.session_state.generated and st.session_state.projects:
                state = st.session_state.associate_state

                project_names = [
                f"{i + 1}. {proj['project_name']}"
                for i, proj in enumerate(state["projects"])
            ]

                selected_project_name = st.selectbox(
                "Choose a project to explore:",
                    project_names,
                    index=st.session_state.selected_project,
                    key="project_selector_associate"
                )

                st.session_state.selected_project = project_names.index(selected_project_name)
                proj = state["projects"][st.session_state.selected_project]

                # ------------------------
                # Project Title + Description
                st.header(proj["project_name"])
                st.write(proj["description"])

                # ------------------------
                # Materials Needed
                st.subheader("🧰 Materials Needed")
                for item in proj["materials_needed"]:
                    st.write("-", item)

                # ------------------------
                # Suggested Materials
                if "materials_suggested" in proj and proj["materials_suggested"]:
                    st.subheader("🛒 Suggested Upgrades (Optional)")
                    st.caption("Cheap household items you could buy to improve the project.")
                    for item in proj["materials_suggested"]:
                        st.write("-", item)

                # ------------------------
                # Physics Explanation
                st.subheader("🧪 Physics Explanation")
                render_physics_explanation(proj["physics_explanation"])

                # ------------------------
                # Steps
                st.subheader("🛠️ Build Steps")
                steps = proj["steps"]

                if isinstance(steps, list):
                    for i, step in enumerate(steps, 1):
                        st.write(f"{i}. {step}")

                elif isinstance(steps, dict):
                    for section, section_steps in steps.items():
                        st.markdown(f"### {section}")
                        for i, step in enumerate(section_steps, 1):
                            st.write(f"{i}. {step}")

                # ------------------------
                # User collaboration input
                st.divider()
                st.subheader("💡 Contribute to the project")

                user_input = st.text_area(
                    "Add your ideas or modifications to this project:",
                    placeholder="Add something small or big..."
            )

                if st.button("Update Project with My Ideas") and user_input.strip():
                    # Save user input to chat_messages
                    st.session_state.chat_messages.append({"role": "user", "content": user_input})

                    # Prepare AI message to adapt project
                    chat_messages = [
                    {"role": "system",
                     "content": "You are ForgeAI, helping to adapt engineering projects to user specifications."},
                    {"role": "system",
                     "content": (
                         f"Current project: {proj['project_name']}\n"
                         f"Description: {proj['description']}\n"
                         f"Materials needed: {', '.join(proj['materials_needed'])}\n"
                         f"Steps: {proj['steps']}"
                     )
                     }
                ]

                    # Add all previous chat contributions
                    chat_messages += st.session_state.chat_messages

                    # Call AI to adapt project
                    ai_reply = generate_projects(chat_messages, chat_mode=True)

                    # Append AI reply to session history
                    st.session_state.chat_messages.append({"role": "assistant", "content": ai_reply})

                    # Parse AI response (expecting same JSON structure as original)
                    if "projects" in ai_reply:
                        st.session_state.projects[st.session_state.selected_project] = ai_reply["projects"][0]

                    # Rerender updated project
                    st.rerun()

            if st.session_state.generated and st.session_state.projects:
                if st.button("⭐ Save to Project Board"):
                    proj = st.session_state.projects[st.session_state.selected_project]
                    if proj not in st.session_state.project_board:
                        st.session_state.project_board.append(proj)
                        st.success("Project saved!")
                    else:
                        st.info("Project already saved.")


    # =========================================================
    # INNOVATOR 💡
    # =========================================================
    elif experience == "Innovator💡":

        st.subheader("Tony Stark Mode")
        st.caption("Have ForgeAI become your engineering assistant.")

        state = st.session_state.innovator_state

        # Show chat history
        for msg in state["chat"]:
            with st.chat_message(msg["role"]):
                st.markdown(msg["content"])


        user_input = st.chat_input("Describe your invention or ask ForgeAI...")

        if user_input:

            # Save user message
            state["chat"].append({
                "role": "user",
                "content": user_input
            })

            # Call Innovator AI
            ai_reply = forge_chat(
                "innovator",
                state["chat"],
                user_input
            )

            # Save AI reply
            state["chat"].append({
                "role": "assistant",
                "content": ai_reply
            })

            # Optional memory system
            if "goal" in user_input.lower():
                st.session_state.forge_memory["goal"] = user_input

            if "build" in user_input.lower() or "project" in user_input.lower():
                st.session_state.forge_memory["current_project"] = user_input

            st.session_state.forge_memory["notes"].append(user_input)

            st.rerun()