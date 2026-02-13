def get_user_input():
    age = input("What is your age?: ")
    materials = input("What items do you have in your house?: ")
    topic = input("Which branch are you most intereste in?: ")

    return f"I am {age} years old, I currently have {materials} near me, And I am interested in {topic}"