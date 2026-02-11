VALID_TRANSITIONS = {
    "draft": {"pending"},
    "pending": {"approved", "rejected"},
    "approved": {"approved_under_review", "archived"},
    "approved_under_review": {"approved", "rejected"},
    "rejected": {"archived"},
    "archived": {"approved"},
}
