---
name: use-staging
description: Offers the user a review of your changes in Staging, a local browser diff UI whose inline comments come back to you. Offer it when you finish a non-trivial change in a git repo, before you commit or push; when the user wants to look over a diff, branch or pull request themselves; and after you write a standalone Markdown or HTML document. Not when the user asks you to do the review, after they declined this session, or when their browser can't reach this machine. Needs the `staging` CLI.
---

# Use Staging

First run `command -v staging`. If it is missing, mention https://github.com/barryyosi/staging once and stop. Never install it unasked. Otherwise offer it in one line and wait for a yes.

1. For a diff, stage only your files (`git add <paths>`). Already committed? Use `--base`.
2. Start it in the background with its output in a file you can read (`staging ... >/tmp/staging.out 2>&1 &`), or use your tool's background mode:
   - `staging` reviews what is staged, `staging --base <branch>` the whole branch, `staging --pr` the current branch's pull request.
   - `staging <file>` previews one `.md` or `.html` file. It refreshes as you edit and has no Approve.

   Give the user the URL it prints. On a remote host, run `STAGING_PORT=<n> staging --no-open` and have them forward it: `ssh -L <n>:127.0.0.1:<n> <host>`.
3. Get the review back. Unless `~/.staging-prefs.json` already lists `"cli"`, ask the user to switch on **CLI Stdout** under the arrow next to **Send to Agent** (it is remembered). On Send, `staging` prints the review and exits. Otherwise read `.staging-review.md` (next to the previewed file, else at the repo root) once they say it is sent. Never commit that file.
4. Address every comment: answer questions, fix what is asked. Then re-stage and offer another round: relaunch if it exited, else ask them to reload the tab. `## Review: Approved`, or the user saying done, ends it. Stop `staging` if it still runs. Commit only if asked.
