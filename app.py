import streamlit as st


#Main Page Title
st.set_page_config("Enginuity", page_icon="🛠️")
st.page_link("app.py", label= "home", icon= "🏠")

st.title("🛠️ Enginuity"),
st.subheader("Build what you have. master what you make")

st.write("Your AI sidekick for Hands-On Discovery")

#User Input
st.write("Which topic do you want to do a project on?: ")

st.page_link("pages/aerospace.py", label= "Aerospace✈️")
st.page_link("pages/chemical.py", label= "Chemical🧪")
st.page_link("pages/mechanical.py", label= "Mechanical🔧")
st.page_link("pages/electrical.py", label= "Electrical💡")
st.page_link("pages/ai_coding.py", label= "Computer Science💻")
st.page_link("pages/robotics.py", label= "Robotics🤖")
st.page_link("pages/civil.py", label= "Civil🏗️")










