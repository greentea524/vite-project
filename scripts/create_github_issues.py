#!/usr/bin/env python3
"""
create_github_issues.py
=======================

Mirror a list of tickets into a GitHub repository as issues, using nothing but
the Python standard library.

This is the cleaned-up version of the throwaway script used to mirror the Jira
SUD-1..SUD-7 (Sudoku) tickets into greentea524/vite-project as closed issues.

What it demonstrates
--------------------
1. Reusing the credential Git already has (via `git credential fill`) instead of
   asking you to paste a Personal Access Token. The token that lets you `git
   push` over HTTPS also works for the GitHub REST API, so there's nothing extra
   to configure.
2. Talking to the GitHub REST API with only `urllib` — no `requests`, no `gh`
   CLI, no third-party packages.
3. Creating an issue (POST) and then closing it (PATCH) to mirror a ticket whose
   work is already Done.

Usage
-----
    python scripts/create_github_issues.py            # really create issues
    python scripts/create_github_issues.py --dry-run  # print what *would* happen

Notes
-----
* Creating issues is outward-facing and awkward to undo (you can only close
  issues, not delete them via the API), so `--dry-run` is the default-safe way
  to preview first.
* The token needs the `repo` scope (or `public_repo` for public repos). The
  credential stored by Git Credential Manager after a normal `git push` already
  has this.
"""

import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.request

# --- Configuration ----------------------------------------------------------

OWNER_REPO = "greentea524/vite-project"          # <owner>/<repo>
JIRA_BASE = "https://gtea524.atlassian.net/browse/"

# Each ticket: (jira_key, title, markdown_body). Edit this list to mirror a
# different set of tickets. In the original script this was fetched from Jira,
# but keeping it inline makes the example self-contained.
TICKETS = [
    ("SUD-1", "Set up 9x9 Sudoku grid with colorful 3x3 box theming",
     "Render a 9x9 Sudoku grid where each of the nine 3x3 boxes has its own "
     "distinct bold accent color. Cells should be clearly separated with "
     "borders. The grid should be clean and modern in style."),
    ("SUD-2", "Load a pre-generated Sudoku puzzle with fixed clue cells",
     "On game start, load a valid puzzle. Given/clue cells are styled bold and "
     "non-editable, distinct from player-filled cells."),
    # ... add the rest of your tickets here ...
]


# --- Helpers ----------------------------------------------------------------

def get_github_token() -> str:
    """Ask Git for the token it already stores for github.com.

    `git credential fill` reads a "protocol/host" query on stdin and prints the
    matching stored credential. We pull the `password=` line, which for GitHub
    over HTTPS is the access token.
    """
    result = subprocess.run(
        ["git", "credential", "fill"],
        input="protocol=https\nhost=github.com\n\n",
        capture_output=True,
        text=True,
    )
    for line in result.stdout.splitlines():
        if line.startswith("password="):
            return line[len("password="):]
    raise SystemExit(
        "No GitHub token found in the Git credential store. "
        "Run a `git push` to github.com once so the credential is saved, "
        "then re-run this script.\n" + result.stderr
    )


def github_api(method: str, url: str, token: str, payload=None):
    """Minimal GitHub REST API call using only urllib."""
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(url, data=data, method=method)
    request.add_header("Authorization", f"Bearer {token}")
    request.add_header("Accept", "application/vnd.github+json")
    request.add_header("X-GitHub-Api-Version", "2022-11-28")
    request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        # Surface the API's error body — it usually says exactly what's wrong.
        print(f"HTTP {error.code}: {error.read().decode()[:500]}", file=sys.stderr)
        raise


def create_closed_issue(token: str, key: str, title: str, body: str):
    """Create one issue, then close it (to mirror a Done ticket)."""
    jira_link = f"{JIRA_BASE}{key}"
    full_body = f"{body}\n\n---\n_Mirrored from Jira [{key}]({jira_link}) (status: Done)._"

    created = github_api(
        "POST",
        f"https://api.github.com/repos/{OWNER_REPO}/issues",
        token,
        {"title": f"[{key}] {title}", "body": full_body},
    )
    number = created["number"]

    # `state_reason: completed` renders the purple "completed" check on GitHub;
    # use "not_planned" instead for issues you're closing as won't-do.
    github_api(
        "PATCH",
        f"https://api.github.com/repos/{OWNER_REPO}/issues/{number}",
        token,
        {"state": "closed", "state_reason": "completed"},
    )
    return number, created["html_url"]


# --- Entry point ------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be created without calling the GitHub API.",
    )
    args = parser.parse_args()

    if args.dry_run:
        for key, title, _ in TICKETS:
            print(f"[dry-run] would create + close: [{key}] {title}")
        return

    token = get_github_token()
    for key, title, body in TICKETS:
        number, url = create_closed_issue(token, key, title, body)
        print(f"{key} -> #{number} {url} (closed)")
    print("DONE")


if __name__ == "__main__":
    main()
