import streamlit as st
from core.input_builder import build_user_description
from core.ai_engine import generate_project


def show_base_page(topic):

    global project_response
    st.title(topic)

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
        difficulty = st.selectbox("What difficulty do you have?",
                                  ["Easy: 5–10 min", "Medium: 15–30 min", "Hard: 30–45 min"])
    elif education == "High-Schooler(15-18 years old)🏫":
        difficulty = st.selectbox("What difficulty do you have?",
                                  ["Easy: 10–30 min", "Medium: 45–60 min", "Hard: 60–90 min"])
    elif education == "Student(18-25 years old)🎓":
        difficulty = st.selectbox("What difficulty do you have?",
                                  ["Easy: 30–60 min", "Medium: 60–120 min", "Hard: 2 days–1 week"])
    else:  # Adult
        difficulty = st.selectbox("What difficulty do you have?",
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
        project_response = generate_project(user_description)

        # ------------------------
        # Display results safely
    if project_response is not None:
        if "error" in project_response:
            st.error(project_response["error"])
        else:
            # Save projects so Streamlit remembers them
            projects = project_response["projects"]

            # ------------------------
            # Project selector
            project_names = [
                f"{i + 1}. {proj['project_name']}"
                for i, proj in enumerate(projects)
            ]

            selected_project_name = st.selectbox(
                "Choose a project to explore:",
                project_names
            )

            selected_index = project_names.index(selected_project_name)
            proj = projects[selected_index]

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

            # Center + enlarge formulas automatically
            physics_text = proj["physics_explanation"]

            centered_physics = f"""
            <style>
            .formula {{
                text-align: center;
                font-size: 22px;
                font-weight: bold;
                margin: 20px 0;
            }}
             </style>
            {physics_text}
            """

            st.markdown(centered_physics, unsafe_allow_html=True)

            # ------------------------
            # Steps (NOW SUPPORTS SUBSECTIONS)
            st.subheader("🛠️ Build Steps")

            steps = proj["steps"]

            # Case 1: simple list (younger users)
            if isinstance(steps, list):
                for i, step in enumerate(steps, 1):
                    st.write(f"{i}. {step}")

            # Case 2: subsection format (older users)
            elif isinstance(steps, dict):
                for section, section_steps in steps.items():
                    st.markdown(f"### {section}")
                    for i, step in enumerate(section_steps, 1):
                        st.write(f"{i}. {step}")