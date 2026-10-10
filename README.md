# Simmer

A shared, mobile-first recipe book and lunch/dinner planner for Jason and Wah, with shopping sent to Tally.

## Run locally

Requires Node.js 24 or newer. No dependency installation is needed.

```sh
npm start
```

Open http://localhost:4195. Run tests with `npm test`.

## Features

- Search using multi-select filters for main ingredient, cuisine, dish type, ingredient count and estimated time. Search cuisines, browse popular choices first, and remove individual selections using active filter chips. Option counts come from the local catalogue and respond to the other filters. Plain browsing leaves out desserts, drinks and sauces; a filter or text search can still find them.
- Rotate adventurous dish ideas that have matches in the local catalogue.
- Fill unknown cuisine and dish-type tags conservatively with `node scripts/classify-unknown.mjs data` (preview), then add `--apply` to back up and update the catalogue. Existing classifications and recipe content are preserved.
- For a cuisine-only pass, add `--cuisine-only`; add `--everyday` to put remaining unclassifiable recipes in “Everyday / international” without claiming a regional origin. Cuisine inference uses recognised dish names and combined ingredient clues, not a single generic ingredient.
- Reviewed cuisine and dish-type tags live in `lib/manual-classification.json` and are applied automatically when the server starts and after `retag-catalogue.mjs`. Preview with `node scripts/apply-classification.mjs data`, or add `--apply` to back up and apply now. Only “Everyday / international” and “Other dishes” are replaced. Its `hidden` list removes non-food entries (crafts, dyes) from search without deleting them.
- Check old backups with `node scripts/prune-backups.mjs data` (report only). Add `--delete` to remove all but the newest 2 backups of each kind (`--keep N` to change), and `--include-staging` to also remove retired datasets and import staging folders. Live databases and photos are never touched.
- Find likely duplicate catalogue recipes with `node scripts/find-duplicates.mjs data` (add `--all` for same-name recipes with different ingredients, `--json` for machine-readable output). It only reports; remove copies from the recipe view in the app.
- Remove unwanted recipes from the shared search collection with confirmation. Local catalogue/search rows are deleted, removed IDs are remembered to prevent re-imports or MealDB reappearance, and saved copies/calendar meals are preserved. Photos remain for saved copies and backups.
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
- `MEALDB_API_KEY`: optional key for the one-time MealDB import. The default development key is `1`; check [provider terms](https://www.themealdb.com/terms_of_use.php) before public release.

Search uses the local catalogue, including imported Epicurious, Tasty and TheMealDB recipes and photos. It does not contact TheMealDB while searching or opening a recipe. TheMealDB import uses the official API, retains source attribution, skips duplicate titles and previously removed recipes, and can be rerun to add new meals. These datasets do not provide reliable serving counts, so portions must be confirmed before scaling. Instructions retain the original detail, displayed as numbered steps. Name-only meals have no shopping ingredients.

To import or update TheMealDB recipes on this computer, run with Node 24:

```sh
node scripts/import-mealdb.mjs data
```

The importer creates `data/catalogue-before-mealdb-*.db` before changing the catalogue and records a summary in `catalogue_meta` under `mealdb-import-report`. It downloads photos into `data/catalogue-images/`. A failed or interrupted run can be rerun.

### Moving Simmer to another computer

The `data/` directory is ignored by Git, so switching branches or cloning this repository does **not** transfer the imported recipes. Stop Simmer on the old computer, then copy `data/catalogue.db` **and** the entire `data/catalogue-images/` folder to the same paths on the new computer. Copy `data/simmer.db` too if you want your saved recipes and meal plan. Start Simmer on the new computer after the copy; Node 24 is required. The backup files are optional. If you cannot copy the old catalogue, run the MealDB import command above on the new computer, but that only restores MealDB recipes, not the existing Epicurious and Tasty imports.

Run `npm run check:data` after copying. It reads the local database and verifies the three source counts, the MealDB import record, the photos, and `simmer.db`. `CLAUDE.md` and `AGENTS.md` tell Claude and Codex to run this check and flag mismatches when they work in the repository.

To import your supplied image archive, use Python 3 and Node 24:

```sh
python3 scripts/import-archive.py /path/to/archive.zip --output /path/to/empty-staging
node scripts/index-archive.mjs /path/to/empty-staging
```

Stop Simmer before replacing `data/catalogue.db` and `data/catalogue-images` with the staged equivalents. Back up the existing catalogue first and never replace `data/simmer.db` (your saved recipes and calendar). The supplied archive yielded 12,858 unique usable recipes with local photos. Keep datasets and photos out of Git. Archive licence metadata is not a guarantee of rights to the underlying Epicurious content; check permissions before redistributing it.

Recipe-link import supports accessible [Schema.org Recipe](https://schema.org/Recipe) pages. Importing a recipe link contacts its source; normal catalogue search and recipe details are local.

The additional mixed-cuisine [Tasty collection](https://github.com/sandhaka/recipes-dataset) has 4,961 source entries. Download its `out_set/recipes.json`, `dishes.json` and `tags.json` into a local input folder, then stage and merge:

```sh
python3 scripts/prepare-tasty.py /path/to/input --output /path/to/staging --catalogue-root data
node scripts/merge-tasty.mjs /path/to/staging data
```

Staging downloads only the dataset's matching BuzzFeed photos, checks JPEG dimensions, skips existing titles and retains original ingredient quantities (not inconsistent metric conversions). Rerunning staging reuses completed downloads. For a diagnosed DNS outage, `--photo-ip` accepts a verified public address for the photo host while keeping normal hostname/TLS verification; it does not change system DNS. Merging backs up the catalogue, preserves saved recipes/calendar and rejects duplicate names, contents or photos. The repository's MIT label does not establish permission for the underlying Tasty content; do not redistribute these datasets without checking source rights.

Docker configuration uses a separate persistent volume. Deploy with `docker compose -f compose.server.yml up -d --build` after backing up the `simmer-data` volume. The image has a health check on `/api/health`. On the first start after an upgrade, Simmer backs up `/data/catalogue.db` to `catalogue-before-manual-classification-<timestamp>.db` and then applies the reviewed tags; later starts change nothing. No new environment variables are needed. This app currently has no authentication: do not expose it publicly until access control is configured. Offline editing is not supported.
