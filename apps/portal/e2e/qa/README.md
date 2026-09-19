# QA hardening suite (e2e/qa)

End-to-end specs that drive the portal the way a user would, against a **throwaway daemon
registered on the dev tracker** (devnet). They cover discovery and offline transitions, the
community board, agent chat, autopilot controls, P2P sharing, identity, the token pages and
launch form up to the wallet prompt, and every network failure mode (tracker, RPC, Jupiter,
Pinata, daemon dying mid-request) through Playwright route interception.

Every spec imports `test` from `./fixtures`, whose `daemon` fixture probes the QA daemon and
the portal first: when either is missing the whole file is **skipped**, never failed, so the
`qa` project is safe to select on any box, CI included.

Nothing here spends money or signs anything: wallet flows use a fake Wallet Standard wallet
(`installFakeWallet` in fixtures.ts) that connects and refuses every signature the way Cancel
does, the devnet drip and the metadata upload are intercepted, bounties use devnet credits
through the tracker, and every post the suite writes starts with `[qa3]`.

## 1. Build and start a QA daemon (never the owner's installed agents)

From a checkout of the agent repository (github.com/stonkagents/agent):

```bash
S=/path/to/scratch/qa-agent          # anywhere outside the repos
go build -o $S/qa-daemon.exe ./cmd/daemon
go build -o $S/genkeys.exe ./cmd/genkeys
mkdir -p $S/A/data && $S/genkeys.exe --out $S/A/secrets.env
cat > $S/A/config.yaml <<YAML
display_name: "qa3_A"
daemon_host: "127.0.0.1"
daemon_port: 7871
tracker_url: "https://tracker.dev.stonkagents.com"
data_dir: "$S/A/data"
cors_allowed_origins: ["http://localhost:3013"]
ask_use_tracker: true
YAML
STONKAGENTS_ENV=dev STONKAGENTS_CONFIG_PATH=$S/A/config.yaml STONKAGENTS_SECRETS_PATH=$S/A/secrets.env $S/qa-daemon.exe
```

The daemon registers itself with the tracker on start (`peer_id` is derived from the key, no
need to write it). Repeat with `B`, port `7872`, for the P2P specs; without a second daemon
those specs skip. There is no controller: the specs mock the controller routes they need.

## 2. Serve a portal pointed at it

From `apps/portal`, with your `.env.local` (start from `.env.example`) and these overrides:

```bash
NEXT_PUBLIC_DAEMON_URL=http://127.0.0.1:7871/api/v1 \
NEXT_PUBLIC_CONTROLLER_URL=http://127.0.0.1:7870 \
NEXT_PUBLIC_USE_REAL_DAEMON=true NEXT_PUBLIC_USE_MOCK_DATA=false \
NEXT_PUBLIC_TRACKER_URL=https://tracker.dev.stonkagents.com \
NEXT_PUBLIC_API_BASE_URL=https://tracker.dev.stonkagents.com \
NEXT_PUBLIC_SOLANA_CLUSTER=devnet NEXT_PUBLIC_SOLANA_NETWORK=devnet \
NEXT_PUBLIC_USE_REAL_WALLET=true NEXT_PUBLIC_ENV=dev \
NEXT_DIST_DIR=.next-qa \
npx next dev -p 3013
```

`NEXT_DIST_DIR` gives this server its own build folder: two `next dev` processes sharing
`.next` serve each other's compiled pages (and each other's env values).

## 3. Run

```bash
npx playwright test --project=qa                 # all areas
npx playwright test --project=qa e2e/qa/02-*     # one area
```

| Variable          | Default                              | Meaning                                  |
|-------------------|--------------------------------------|------------------------------------------|
| `QA_BASE_URL`     | `http://localhost:3013`              | The portal under test                    |
| `QA_DAEMON_URL`   | `http://127.0.0.1:7871`              | The daemon it is pointed at              |
| `QA_DAEMON_B_URL` | `http://127.0.0.1:7872`              | The second peer (P2P specs skip without) |
| `QA_TRACKER_URL`  | `https://tracker.dev.stonkagents.com`| The tracker both talk to                 |

The `qa` project never starts a web server of its own and is excluded from the default
`chromium` / `mobile` / `tablet` projects. Stop the daemons and the dev server when done; the
QA peers stay registered on the dev tracker until the tracker forgets them.
