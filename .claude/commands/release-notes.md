---
description: Draft release notes from merged PRs since the last tag
allowed-tools: Bash(git describe:*), Bash(git log:*), Bash(gh pr list:*)
---
Find the last tag with `git describe --tags --abbrev=0` (if none, use the first commit).
List commits since then with `git log <tag>..HEAD --pretty=format:'%s (%h)'`.

Group by Conventional Commit type into: Features, Fixes, Docs, Chores.
Mark agent-authored changes with (agent). Keep it short and written for users, not engineers.
