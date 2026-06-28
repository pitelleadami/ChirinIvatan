def _is_all_caps_text(text):
    letters = [character for character in text if character.isalpha()]
    return bool(letters) and all(character.isupper() for character in letters)


def _capitalize_piece(piece):
    if not piece:
        return piece
    return f"{piece[0].upper()}{piece[1:].lower()}"


def title_case_words(value):
    text = str(value or "").strip()
    if not text:
        return ""
    return " ".join(
        "-".join(
            "'".join(_capitalize_piece(part) for part in apostrophe_piece.split("'"))
            for apostrophe_piece in word.split("-")
        )
        for word in text.split()
    )


def normalize_person_name(value):
    text = str(value or "").strip()
    if not text:
        return ""
    if _is_all_caps_text(text):
        return title_case_words(text)
    return text


def normalize_affiliation_text(value):
    return title_case_words(value)


def normalize_username(value):
    return str(value or "").strip().lower()


def clean_name_extension(first_name, last_name, extension):
    suffix = str(extension or "").strip()
    if not suffix:
        return ""
    first = normalize_person_name(first_name)
    last = normalize_person_name(last_name)
    if first and last and first.casefold() == last.casefold():
        base_name = first
    else:
        base_name = " ".join([part for part in [first, last] if part]).strip()
    if base_name and suffix.casefold() == base_name.casefold():
        return ""
    return suffix


def name_with_extension(user, profile=None):
    first = normalize_person_name(getattr(user, "first_name", ""))
    last = normalize_person_name(getattr(user, "last_name", ""))
    if first and last and first.casefold() == last.casefold():
        base_name = first
    else:
        base_name = " ".join([part for part in [first, last] if part]).strip() or user.username
    extension = clean_name_extension(first, last, getattr(profile, "name_extension", ""))
    return f"{base_name} {extension}".strip()


def display_name(user, profile=None):
    base_name = name_with_extension(user, profile)
    post_nominals = str(getattr(profile, "post_nominals", "") or "").strip()
    return f"{base_name}, {post_nominals}" if post_nominals else base_name
