---
description: Stage 1 intake gate — is this ticket ready to work on?
argument-hint: <issue number>
allowed-tools: Bash(gh issue view:*), Read
---
Use the `intake` agent on issue $ARGUMENTS (`gh issue view $ARGUMENTS --json title,body,labels`).

Show its verdict. If it is not ready, show the exact question it would post to the reporter.
Do not post anything yourself.
