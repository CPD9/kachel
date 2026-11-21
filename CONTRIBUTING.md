# Contributing

Thank you for helping. These are the rules we work by.

## Work

1. Pick an issue on the board, or ask for one. Every pull request closes an issue (`Closes #N`).
2. Make a branch, commit small steps and open a pull request assigned to yourself.
3. Run `make check` before you push. CI runs the same checks.

## Commits

1. Sign every commit: `git commit -S -s`.
2. Write the subject in plain English, as an instruction, in sentence case, under 72 characters, for example "Pause the job when the tank is full". No prefixes such as `feat:`.
3. Use British spelling.

## Pull requests

1. The title follows the commit rules, because it becomes the commit on `main`.
2. The description is about 100 words under three headings: What, Why, Checked.
3. Every pull request gets at least one review comment. Reply on each thread ("Done in abc1234: …") and resolve it before merge.
4. Mention the person you address, for example @CPD9.
5. To update a pull request, merge `main` into it. Never force-push `main` or someone else's branch.

## Merging

Pull requests are merged with "Squash and merge" only, when every check is green on the latest commit, one approval is given and no conversation is open.

## Data and secrets

Use synthetic and public data only. Keep secrets in local `.env` files, which git ignores. Each app and service has an `.env.example` listing what it reads.
