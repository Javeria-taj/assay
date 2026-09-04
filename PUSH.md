# Push this to GitHub

The repo is committed locally with full history. Two commits, working tree clean.

```bash
unzip assay-repo.zip && cd assay

gh repo create assay --public --source=. --remote=origin --push
# or, without gh:
#   git remote add origin git@github.com:<you>/assay.git
#   git push -u origin main
```

Public from the first commit — handoff §6.4.

## Then, in order

1. **Send Javeria the repo link and `FRONTEND.md`.** That is the 13:30 handover;
   she is unblocked from that moment and needs nothing else from you.
2. `pnpm dlx create-next-app@latest apps/web` — hers, per §8.
3. `apps/api` — yours. Implement against the same contract; `pnpm verify` with
   `BASE` pointing at it must go green before you wire the UI to it.
4. Deploy a stub today, not at the end.

## The one thing to tell her in the message

> Contract frozen at 13:30. `pnpm install && pnpm mock`, then read `FRONTEND.md`.
> One env var switches you to the real API — no code change.
