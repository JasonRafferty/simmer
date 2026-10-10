# Simmer data check

Before work involving search, recipes, the backend, or a suspected data mismatch, run `node scripts/check-local-data.mjs` with Node 24 or newer. The check is read-only, respects `DATA_DIR`, and compares this machine's catalogue with `data-requirements.json`. Check `node --version` first: on Jason's Mac the default `node` may be Node 20, so use `/Users/jason/.local/node24/bin/node scripts/check-local-data.mjs` there. A Node version error is not a data mismatch.

`data/` is excluded from Git. If the check fails, report the missing database, source recipes, photos, or saved-data file to Jason before interpreting the result as a code bug. Do not start the server as a data diagnostic because it can create empty databases. Do not overwrite or reimport data without Jason's direction. Follow the transfer instructions in `README.md` under “Moving Simmer to another computer.”
