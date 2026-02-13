import streamlit as st
from core.ai_engine import generate_project
import pandas as pd
import numpy as np
from core.main import main

st.title("Aerospace✈️")

education = st.selectbox("What form of education do you have?",
                          [
                              "Middle-Schooler(10-14 years old)🖍️"
                              , "High-Schooler(15-18 years old)🏫"
                              , "Student(18-25 years old)🎓"
                              , "Adult(25+ years old)🧔🏻"
                           ])
if education == "Middle-Schooler(10-14 years old)🖍️":
    difficulty = st.selectbox("What difficulty do you have?",
                               [
                                   "Easy: 5 minutes - 10 minutes",
                                   "Medium: 15 minutes- 30 minutes",
                               "Hard: 30 minutes- 45 minutes"
                               ])


elif education == "High-Schooler(15-18 years old)🏫":
    difficulty = st.selectbox("What difficulty do you have?",
                               [
                                   "Easy: 10 minutes - 30 minutes",
                                   "Medium: 45 minutes- 60 minutes",
                                   "Hard: 60 minutes- 90 minutes"
                                   ])


elif education == "Student(18-25 years old)🎓":
    difficulty = st.selectbox("What difficulty do you have?",
                               [
                                   "Easy: 30 minutes - 60 minutes",
                                   "Medium: 60 minutes- 120 minutes",
                                   "Hard: 2 days- 1 week"
                                   ])

else: #Adult(25+ years old)🧔🏻
    difficulty = st.selectbox("What difficulty do you have?",
                               [
                                   "Easy: 30 minutes - 60 minutes",
                                   "Medium: 60 minutes- 180 minutes",
                                   "Hard: 5 days- 2 weeks"
                               ])

materials = st.text_area(
    "What materials do you have at home?",
    placeholder="Example: cardboard, tape, plastic bottle, DC motor..."
)

if st.button("Generate Aerospace Project ️✈️️️"):
    user_description = f"""
      Education Level: {education}
      Difficulty Chosen: {difficulty}
      Materials Available: {materials}
      Topic: Aerospace
      """

with st.spinner:
    project = generate_project(user_description)


