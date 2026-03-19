# Relay Mac Setup

Operational notes for the production ProPresenter relay Mac.

## Current Status

Verified on March 19, 2026:

- Weather import is working.
- ProPresenter runtime import is working.
- The relay LaunchAgent is installed and running automatically on the relay Mac.

## Relay Mac Location

Current production repo path:

```bash
/Users/production/Code/BFC-Sunday-Ops
```

Do not run the LaunchAgent from `~/Documents`. During setup, `launchd` hit `Operation not permitted` errors when the repo lived there. Keeping the repo under `~/Code` avoided that issue.

## Relay Setup

On the relay Mac:

```bash
cd "/Users/production/Code/BFC-Sunday-Ops"
git pull
./scripts/install-relay-launch-agent.sh --hour 5 --minute 0
```

That installs a per-user LaunchAgent with label:

```bash
com.bfc.sundayops.propresenter-relay
```

Behavior:

- Runs at login.
- Runs every day at `05:00` local time.
- Writes logs to `~/Library/Logs/BFC-Sunday-Ops/`.

## Verify LaunchAgent

Check status:

```bash
launchctl print gui/$(id -u)/com.bfc.sundayops.propresenter-relay
```

Healthy signs:

- `state = running`
- `last exit code = (never exited)` or a recent successful run
- `working directory = /Users/production/Code/BFC-Sunday-Ops`

Force a fresh run:

```bash
launchctl kickstart -k gui/$(id -u)/com.bfc.sundayops.propresenter-relay
```

Watch logs:

```bash
tail -f ~/Library/Logs/BFC-Sunday-Ops/propresenter-relay.log
tail -f ~/Library/Logs/BFC-Sunday-Ops/propresenter-relay.error.log
```

## Manual Relay Commands

Run the relay immediately:

```bash
node scripts/propresenter-relay.js --now
```

Probe ProPresenter hosts and endpoints:

```bash
node scripts/propresenter-relay.js --probe --now
```

Expected behavior:

- `clock_number` is zero-based.
- `0` is the first ProPresenter timer.
- `1` is the second ProPresenter timer.

## ProPresenter Notes

The relay now:

- uses the operational Sunday date instead of the literal current date
- creates the Sunday record if needed
- tries HTTP timer endpoints first
- falls back to ProPresenter's TCP/IP API if HTTP fails
- logs which transport and endpoint succeeded

Known issue found during setup:

- `10.1.51.39` was a typo and should have been `10.1.51.139`

If runtime values look wrong:

1. Run the probe command.
2. Confirm the host IP is correct.
3. Confirm the `clock_number` in Sunday Ops matches the zero-based timer index returned by the probe.

## Weather Import

Weather import is configured separately from the relay.

Manual test:

```bash
node scripts/fetch-weather.js --now
```

Operational notes:

- Weather settings are stored in `weather_config`.
- The importer writes weather for the current or upcoming Sunday.
- The GitHub Actions workflow checks every 5 minutes and imports once the configured day/time has passed.

## Troubleshooting

If the LaunchAgent shows `last exit code = 126`:

- confirm the repo is not under `~/Documents`
- confirm the wrapper script exists:

```bash
ls -l /Users/production/Code/BFC-Sunday-Ops/scripts/run-propresenter-relay.sh
```

- reinstall the LaunchAgent:

```bash
cd "/Users/production/Code/BFC-Sunday-Ops"
./scripts/install-relay-launch-agent.sh --hour 5 --minute 0
```

If the relay can reach some ProPresenter hosts but not others:

- run `node scripts/propresenter-relay.js --probe --now`
- verify the IP address in Sunday Ops
- verify ProPresenter's API is enabled on port `1025`

If the logs need a clean slate during troubleshooting:

```bash
: > ~/Library/Logs/BFC-Sunday-Ops/propresenter-relay.log
: > ~/Library/Logs/BFC-Sunday-Ops/propresenter-relay.error.log
launchctl kickstart -k gui/$(id -u)/com.bfc.sundayops.propresenter-relay
```
