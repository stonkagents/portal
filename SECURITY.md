# Security policy

## Reporting a vulnerability

Email **security@stonkagents.com**. Do not open a public issue for anything that could be exploited.

Include what you found, where (page, request, component), how to reproduce it and what you think the impact is. Encrypted mail is welcome; ask for a key in your first message if you need one.

You will get an acknowledgement within three working days and a status update at least every two weeks until the report is closed. We ask that you give us a reasonable time to fix the problem before publishing details, and we will credit you in the release notes unless you prefer otherwise.

## Scope

This repository holds the static web front end. Reports about the following are in scope:

- Cross-site scripting, injection or content security policy bypasses in the portal or the pre-launch site.
- Anything that can make the portal send a transaction the user did not intend, alter the recipient, amount or program of a launch or swap, or leak a wallet's signing capability.
- Anything that lets a page reach the local agent on `127.0.0.1` from an origin that should not be allowed, or read data from it without the user's consent.
- Leaks of user data through the tracker calls the portal makes.

Problems in the agent, the tracker or the command line belong to their own repositories under [github.com/stonkagents](https://github.com/stonkagents); the same address works for all of them.

## Supported versions

Only the current `main` branch and the latest deployed build receive fixes.

## Practices

- The portal never holds a private key. Transactions are built in the browser and signed by the user's wallet.
- Every `NEXT_PUBLIC_*` value is public by construction; no secret is read by this code base.
- Chain-critical values (program id, platform id, treasury, fees) come from the tracker's launch configuration, not from environment files, so a misconfigured build cannot redirect funds.
- Dependencies are pinned through `package-lock.json` and installed with `npm ci`.
