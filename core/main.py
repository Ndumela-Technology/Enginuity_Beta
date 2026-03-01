from core.ai_engine import generate_projects
from user_input import get_user_input


def main():
    user_description = get_user_input()
    project = generate_projects(user_description)

    if "error" in project:
        print("⚠️ Error:", project["error"])
        return

    print("\n🔧 Your Engineering Project:\n")
    print("Project Name:", project["project_name"])
    print("\nDescription:", project["description"])
    print("\nMaterials Needed:")
    for item in project["materials_needed"]:
        print("-", item)

    print("\nSteps:")
    for i, step in enumerate(project["steps"], 1):
        print(f"{i}. {step}")

    print("\nWhat You Learn:")
    print(project["what_you_learn"])


if __name__ == "__main__":
    main()