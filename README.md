# Simmer

A shared, mobile-first recipe book and lunch/dinner planner for Jason and Wah, with shopping sent to Tally.

## Run locally

Requires Node.js 24 or newer. No dependency installation is needed.

```sh
npm start
```

Open http://localhost:4195. Run tests with `npm test`.

## Features

- Search recipes with a short, availability-checked category/cuisine list and rotating ideas.
- Import recipe links or add your own from Saved.
- Plan lunch and dinner, including quick name-only meals. Hold to edit, delete, drag or swap meals.
- Save recipes together, adjust portions and remove ingredients already in your cupboard.
- Review shopping before sending to a shared Tally list. Retries cannot apply the same send twice.
- Undo meal removals and recipe deletions.

## Configuration

- `PORT`: defaults to 4195.
- `DATA_DIR`: defaults to `data`; SQLite state must be preserved and backed up.
- `TALLY_URL`: defaults to http://127.0.0.1:4188. Requires Tally's Simmer integration endpoint.
- `TALLY_COOKIE`: optional authenticated Tally session; never commit it.
- `MEALDB_API_KEY`: optional recipe provider key. The default development key is `1`; check [provider terms](https://www.themealdb.com/api.php) before public release.

Search combines a local Epicurious photo collection with live TheMealDB results, deduplicating equivalent titles. If TheMealDB is unavailable, local search still works. Cuisine tags in the local collection are inferred; the archive does not provide servings or original recipe URLs. Portions must be confirmed before scaling. Instructions retain the original detail, displayed as numbered steps. Name-only meals have no shopping ingredients.

To import your supplied image archive, use Python 3 and Node 24:

```sh
python3 scripts/import-archive.py /path/to/archive.zip --output /path/to/empty-staging
node scripts/index-archive.mjs /path/to/empty-staging
```

Stop Simmer before replacing `data/catalogue.db` and `data/catalogue-images` with the staged equivalents. Back up the existing catalogue first and never replace `data/simmer.db` (your saved recipes and calendar). The supplied archive yielded 12,858 unique usable recipes with local photos. Keep datasets and photos out of Git. Archive licence metadata is not a guarantee of rights to the underlying Epicurious content; check permissions before redistributing it.

Recipe-link import supports accessible [Schema.org Recipe](https://schema.org/Recipe) pages. External photos and MealDB searches contact their providers.

Docker configuration uses a separate persistent volume. This app currently has no authentication: do not expose it publicly until access control is configured. Offline editing is not supported.
