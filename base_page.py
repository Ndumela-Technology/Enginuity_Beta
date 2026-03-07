import streamlit as st
from core.input_builder import build_user_description
from core.ai_engine import generate_projects
import re
from core.forge_ai_helper import forge_chat
import numpy as np
from openai import OpenAI
import base64
import io
import queue
import soundfile as sf
from streamlit_webrtc import webrtc_streamer, AudioProcessorBase

# Global queue to collect audio chunks
audio_queue = queue.Queue()

class AudioProcessor(AudioProcessorBase):
    def recv_queued(self, frames):

        for frame in frames:
            audio = frame.to_ndarray()

            if audio.ndim > 1:
                audio = np.mean(audio, axis=1)

            audio_queue.put(audio)

        return frames[-1]

# Individual states
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
        "projects": [],
        "selected_project": 0,
        "chat": []
    }

if "innovator_state" not in st.session_state:
    st.session_state.innovator_state = {"chat": []}

if "forge_memory" not in st.session_state:
    st.session_state.forge_memory = {
        "goal": "",
        "current_project": "",
        "constraints": "",
        "notes": []
    }

# -------------------------
# SESSION STATE INITIALIZATION
# -------------------------
if "generated" not in st.session_state:
    st.session_state.generated = False

if "projects" not in st.session_state:
    st.session_state.projects = []

if "selected_project" not in st.session_state:
    st.session_state.selected_project = 0

if "project_board" not in st.session_state:
    st.session_state.project_board = []

if "helper_chat" not in st.session_state:
    st.session_state.helper_chat = []

if "chat_history" not in st.session_state:
    st.session_state.chat_history = []

if "chat_messages" not in st.session_state:
    st.session_state.chat_messages = []

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

# ----------------- Utility Functions -----------------
client = OpenAI()

def speech_to_text(audio_file):

    if audio_file is None:
        return None

    # Handle both BytesIO and normal files
    if hasattr(audio_file, "getvalue"):
        audio_bytes = audio_file.getvalue()
    else:
        audio_bytes = audio_file.read()

    if len(audio_bytes) < 2000:
        return None

    audio_buffer = io.BytesIO(audio_bytes)
    audio_buffer.name = "speech.wav"

    transcript = client.audio.transcriptions.create(
        model="whisper-1",
        file=audio_buffer
    )

    return transcript.text

def text_to_speech(text):

    response = client.audio.speech.create(
        model="gpt-4o-mini-tts",
        voice="alloy",
        input=text
    )

    return response

def render_physics_explanation(text):
    parts = re.split(r"(\$\$.*?\$\$)", text, flags=re.DOTALL)
    for part in parts:
        if part.startswith("$$") and part.endswith("$$"):
            st.latex(part.strip("$"))
        else:
            st.markdown(part)


def speak_ai(text):
    # Use a string path to avoid Path object issues
    speech_file_path = "forge_voice.mp3"

    # Generate speech from OpenAI
    response = client.audio.speech.create(
        model="gpt-4o-mini-tts",
        voice="alloy",
        input=text
    )

    # Make sure we write bytes correctly
    audio_content = getattr(response, "content", None)
    if audio_content is None:
        st.error("Failed to generate audio from AI.")
        return

    with open(speech_file_path, "wb") as f:
        f.write(audio_content)

    # Read audio and encode for Streamlit
    with open(speech_file_path, "rb") as f:
        audio_bytes = f.read()

    b64 = base64.b64encode(audio_bytes).decode()

    audio_html = f"""
        <audio autoplay>
        <source src="data:audio/mp3;base64,{b64}" type="audio/mp3">
        </audio>
    """
    st.markdown(audio_html, unsafe_allow_html=True)

# ----------------- User Input Function -----------------
def get_user_input(interaction_mode):
    if interaction_mode == "Text 💬":
        return st.chat_input("Ask ForgeAI...")
    elif interaction_mode == "Voice 🎙️":
        webrtc_streamer(
            key="voice_stream_live",
            audio_processor_factory=AudioProcessor,
            media_stream_constraints={"audio": True, "video": False},
            async_processing=True
        )
        if not audio_queue.empty():
            audio_data = []
            while not audio_queue.empty():
                audio_data.append(audio_queue.get())
            audio_array = np.concatenate(audio_data).astype(np.float32)
            tmp_file = "voice_input.wav"
            sf.write(tmp_file, audio_array, 16000)
            with open(tmp_file, "rb") as f:
                transcript = speech_to_text(f)

                if transcript:
                    st.caption(f"🗣 You said: {transcript}")
                    return transcript
                else:
                    return None

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

            interaction_mode = st.segmented_control(
                "Interaction Mode",
                ["Text 💬", "Voice 🎙️"],
                key="interaction_mode_apprentice"
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

            st.caption("Here to be at your assistance")


            helper_input = get_user_input(interaction_mode)

            if helper_input:
                # Save user message
                st.session_state.helper_chat.append({"role": "user", "content": helper_input})
                with st.chat_message("user"):
                    st.markdown(helper_input)

                # Call ForgeAI
                ai_reply = forge_chat("apprentice", st.session_state.chat_messages, helper_input,
                                      st.session_state.forge_memory)

                st.session_state.helper_chat.append({"role": "assistant", "content": ai_reply})
                with st.chat_message("assistant"):
                    st.markdown(ai_reply)

                if interaction_mode == "Voice 🎙️":
                    speak_ai(ai_reply)

            # Show previous helper messages
            for msg in st.session_state.helper_chat:
                with st.chat_message(msg["role"]):
                    st.markdown(msg["content"])


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

            interaction_mode = st.segmented_control(
                "Interaction Mode",
                ["Text 💬", "Voice 🎙️"],
                key="interaction_mode_associate"
            )

            # Initialize queue for audio frames
            audio_queue = queue.Queue()

            class AudioProcessor(AudioProcessorBase):
                def recv(self, frame):
                    audio = frame.to_ndarray()
                    if audio.ndim > 1:  # convert to mono
                        audio = np.mean(audio, axis=1)
                    audio_queue.put(audio)
                    return frame


            # ------------------------
            # Process queued audio when available
            audio_data = []
            while not audio_queue.empty():
                audio_data.append(audio_queue.get())

            if audio_data:
                audio_array = np.concatenate(audio_data).astype(np.float32)
                # Save temporary WAV
                tmp_path = "associate_voice_input.wav"
                sf.write(tmp_path, audio_array, 44100)
                # Transcribe using Whisper
                with open(tmp_path, "rb") as f:
                    transcript = client.audio.transcriptions.create(
                        model="whisper-1",
                        file=f
                    )
                voice_text = transcript.text
                st.caption(f"🗣 You said: {voice_text}")

                user_input = None
                if interaction_mode == "Text 💬":
                    user_input = st.chat_input("Ask ForgeAI...")
                elif voice_text:
                    user_input = voice_text

                if user_input:
                    # Send to ForgeAI
                    ai_reply = forge_chat(
                        "associate",
                        st.session_state.associate_state["chat"],
                        user_input
                    )
                    st.session_state.associate_state["chat"].append({"role": "user", "content": user_input})
                    st.session_state.associate_state["chat"].append({"role": "assistant", "content": ai_reply})
                    st.markdown(f"**ForgeAI:** {ai_reply}")

                    if interaction_mode == "Voice 🎙️":
                        speak_ai(ai_reply)


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
                    # Save all generated projects
                    st.session_state.projects = project_response["projects"]
                    st.session_state.generated = True

                    # Also save into the Apprentice/Associate state
                    st.session_state.apprentice_state["projects"] = project_response["projects"]
                    st.session_state.apprentice_state["generated"] = True

                    st.session_state.associate_state["projects"] = project_response["projects"]
                    st.session_state.associate_state["generated"] = True

            if st.session_state.generated and st.session_state.projects:
                state = st.session_state.associate_state
                projects = state.get("projects") or []

                if projects:
                    selected_index = min(state.get("selected_project", 0), len(projects) - 1)
                    project_names = [f"{i + 1}. {p['project_name']}" for i, p in enumerate(projects)]
                    selected_project_name = st.selectbox(
                        "Choose a project to explore:",
                        project_names,
                        index=selected_index,
                        key="project_selector_associate"
                    )

                    # Update selected project index
                    state["selected_project"] = project_names.index(selected_project_name)
                    proj = projects[state["selected_project"]]

                    # ---- Render Project Details ----
                    st.header(proj["project_name"])
                    st.write(proj["description"])
                    st.subheader("🧰 Materials Needed")
                    for item in proj["materials_needed"]:
                        st.write("-", item)

                    if "materials_suggested" in proj and proj["materials_suggested"]:
                        st.subheader("🛒 Suggested Upgrades (Optional)")
                        st.caption("Cheap household items you could buy to improve the project.")
                        for item in proj["materials_suggested"]:
                            st.write("-", item)

                    st.subheader("🧪 Physics Explanation")
                    render_physics_explanation(proj["physics_explanation"])

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

                    # ---- User Collaboration ----
                    st.divider()
                    st.subheader("💡 Contribute to the project")
                    user_input = get_user_input(interaction_mode)

                    if st.button("Update Project with My Ideas") and user_input.strip():
                        st.session_state.chat_messages.append({"role": "user", "content": user_input})
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
                        ai_reply = generate_projects(chat_messages, chat_mode=False)

                    # Append AI reply to session history
                        st.session_state.chat_messages.append({"role": "assistant", "content": ai_reply})

                    # Parse AI response (expecting same JSON structure as original)
                        if "projects" in ai_reply:
                            projects[state["selected_project"]] = ai_reply["projects"][0]
                        st.rerun()

                    else:
                        st.info("No projects generated yet. Please generate a project first.")

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

        st.title(topic)

        interaction_mode = st.segmented_control(
            "Interaction Mode",
            ["Text 💬", "Voice 🎙️"],
            key="interaction_mode_innovator"
        )

        state = st.session_state.innovator_state

        # Show chat history
        for msg in state["chat"]:
            with st.chat_message(msg["role"]):
                st.markdown(msg["content"])

        user_input = get_user_input(interaction_mode)

        if user_input:

            # Show user message
            with st.chat_message("user"):
                st.markdown(user_input)

            # Save user message
            state["chat"].append({
                "role": "user",
                "content": user_input
            })

            # Call ForgeAI
            ai_reply = forge_chat(
                "innovator",
                state["chat"],
                user_input,
                st.session_state.forge_memory
            )

            # Show AI reply
            with st.chat_message("assistant"):
                st.markdown(ai_reply)

            # Save AI reply
            state["chat"].append({
                "role": "assistant",
                "content": ai_reply
            })

            # Voice response if user used voice mode
            if interaction_mode == "Voice 🎙️":
                speak_ai(ai_reply)

            # Optional memory system
            if "goal" in user_input.lower():
                st.session_state.forge_memory["goal"] = user_input

            if "build" in user_input.lower() or "project" in user_input.lower():
                st.session_state.forge_memory["current_project"] = user_input

            st.session_state.forge_memory["notes"].append(user_input)