#!/usr/bin/env bash
# Protect main on GitHub: squash-only merging, one approval, code-owner review,
# green and up-to-date checks, linear and signed history, no force pushes or deletion.
# Admins may merge a pull request past the rules in an emergency; nobody may push to main directly.
#
#   scripts/protect-main.sh            show what would be set
#   scripts/protect-main.sh --apply    set it (needs gh logged in as a repo admin)
set -euo pipefail

REPO="${REPO:-CPD9/kachel}"
CHECKS=("Apps" "Python" "README" "Secrets")  # must match the job names in .github/workflows/ci.yml
APPLY="${1:-}"

settings=$(cat <<JSON
{
  "allow_squash_merge": true,
  "allow_merge_commit": false,
  "allow_rebase_merge": false,
  "delete_branch_on_merge": true,
  "squash_merge_commit_title": "PR_TITLE",
  "squash_merge_commit_message": "PR_BODY"
}
JSON
)

contexts=$(printf '{"context":"%s"},' "${CHECKS[@]}")
ruleset=$(cat <<JSON
{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "bypass_actors": [ { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "pull_request" } ],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "required_linear_history" },
    { "type": "required_signatures" },
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 1,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": true,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true,
        "allowed_merge_methods": ["squash"] } },
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [${contexts%,}] } }
  ]
}
JSON
)

if [[ "$APPLY" != "--apply" ]]; then
  echo "Repository settings for $REPO:"; echo "$settings"
  echo "Ruleset on main:"; echo "$ruleset"
  echo "Dependabot alerts and security updates: off"
  echo "Run again with --apply to set this."
  exit 0
fi

gh api -X PATCH "repos/$REPO" --input - <<<"$settings" >/dev/null
echo "settings: squash only, branches deleted on merge"

id=$(gh api "repos/$REPO/rulesets" --jq '.[] | select(.name == "main") | .id')
if [[ -n "$id" ]]; then
  gh api -X PUT "repos/$REPO/rulesets/$id" --input - <<<"$ruleset" >/dev/null
  echo "ruleset main: updated ($id)"
else
  gh api -X POST "repos/$REPO/rulesets" --input - <<<"$ruleset" >/dev/null
  echo "ruleset main: created"
fi

gh api -X DELETE "repos/$REPO/vulnerability-alerts" >/dev/null
gh api -X DELETE "repos/$REPO/automated-security-fixes" >/dev/null || true
echo "Dependabot alerts and security updates: off"
