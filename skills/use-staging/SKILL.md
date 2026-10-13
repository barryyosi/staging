---
name: use-staging
description: Offers the user a review of your changes in Staging, a local browser diff UI whose inline comments come back to you. Offer it when you finish a change in a git repo, before any commit or push; when the user asks to review a diff, branch or pull request; and after you write or edit a Markdown or HTML document. Skip trivial edits and anything the user declined this session. Needs the `staging` CLI.
---

# Use Staging

Offer it in one line and wait for a yes: it opens a browser tab and waits on the user.

1. Run `command -v staging`. If it is missing, say so once and link https://github.com/barryyosi/staging. Never install it unasked.
2. Stage only what you changed: `git add <paths>`, not `git add -A`, so the user's own edits stay out.
3. Start it in the background, since it runs until the review is sent:
   - `staging` reviews what is staged.
   - `staging --base <branch>` reviews the whole branch, `staging --pr` the open pull request.
   - `staging <file>` previews one `.md` or `.html` file.

   If no browser opens, give the user the URL it prints.
4. Get the review back. Ask the user to tick **CLI Stdout** in the Send menu (it is remembered): `staging` then prints the review to you and exits. Otherwise read `.staging-review.md` at the repo root once they say it is sent.
5. Do what the review asks. Fix every comment, re-stage, and offer another round: relaunch if it exited, or ask the user to reload the tab. `Review: Approved` means done. Commit only if asked.
