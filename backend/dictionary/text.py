def capitalize_first(value):
    text = str(value or "").strip()
    if not text:
        return ""
    return f"{text[0].upper()}{text[1:]}"


def normalize_headword(value):
    text = str(value or "").strip()
    if not text:
        return ""
    return f"{text[0].upper()}{text[1:].lower()}"


def _is_all_caps_sentence(text):
    letters = [character for character in text if character.isalpha()]
    return bool(letters) and all(character.isupper() for character in letters)


def normalize_sentence(value):
    text = str(value or "").strip()
    if not text:
        return ""
    if _is_all_caps_sentence(text):
        text = text.lower()
    text = capitalize_first(text)
    if text.endswith((".", "!", "?", "…")):
        return text
    if text.endswith(('"', "'", ")", "]")) and len(text) > 1 and text[-2] in ".!?…":
        return text
    return f"{text}."
