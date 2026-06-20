# Branch Protection Setup

This document records the GitHub protection settings for `main`.

Branch protection is configured in GitHub repository settings, not only through files in this repository. Use this checklist after the CI workflow has been pushed and has run at least once.

Status as of 2026-06-19: enabled and verified through the GitHub API.

## Target Branch

```text
main
```

## Required Rules

Enable:

- Require a pull request before merging.
- Require status checks to pass before merging.
- Require branches to be up to date before merging.
- Block direct pushes to `main`.
- Do not allow force pushes.
- Do not allow deletions.

Recommended:

- Require at least 1 approval.
- Allow self-review only if this remains a solo capstone repository.
- Require conversation resolution before merging.
- Include administrators, unless an emergency maintenance exception is documented.

## Required Status Checks

The branch protection rule currently requires these status checks:

- `Backend tests`
- `Frontend lint and build`
- `Playwright e2e`

GitHub may display them with the workflow prefix, such as:

- `CI / Backend tests`
- `CI / Frontend lint and build`
- `CI / Playwright e2e`

## GitHub UI Path

1. Open the GitHub repository.
2. Go to `Settings`.
3. Go to `Branches`.
4. Add a branch protection rule.
5. Set branch name pattern to `main`.
6. Enable the rules above.
7. Save changes.

## API Option

If using the GitHub API, use a token with repository administration permission. Do not commit or paste the token into docs, chat, or code.

Example shape:

```bash
curl -X PUT \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer <github-token>" \
  https://api.github.com/repos/pitelleadami/ChirinIvatan/branches/main/protection \
  -d '{
    "required_status_checks": {
      "strict": true,
      "contexts": [
        "Backend tests",
        "Frontend lint and build",
        "Playwright e2e"
      ]
    },
    "enforce_admins": true,
    "required_pull_request_reviews": {
      "required_approving_review_count": 1,
      "dismiss_stale_reviews": true,
      "require_code_owner_reviews": false,
      "require_last_push_approval": false
    },
    "restrictions": null,
    "allow_force_pushes": false,
    "allow_deletions": false,
    "required_conversation_resolution": true
  }'
```

The exact status-check context names should be confirmed after the first CI run on GitHub.
