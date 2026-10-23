Thank you for the change. A few lines here help the review go quickly.

## What and why

<!-- What does this change, and what problem does it solve? If it closes an issue, say so: "Closes #123". -->

## How you checked it

<!-- The commands you ran and what you saw. -->

## Checklist

- [ ] `node --test "tests/*.test.mjs"` and `claude plugin validate --strict .` pass
- [ ] `reuse lint` passes, and `design/README.md` still names the adopted m3l-design version
- [ ] The README tables and `UNVERIFIED.md` are updated if behaviour changed, and every claim about Claude Code behaviour cites a code.claude.com page or is marked unconfirmed
- [ ] Nothing prints prompt text, tool output or paths from a transcript, and no live eval was run without approval of its cost
