# Simmer

A mobile-first recipe book and lunch/dinner planner for Jason and Wah, styled alongside Tally.

Run with Node 24+: `npm start`. Open http://localhost:4195.
Data is saved to `data/simmer.db` (override `DATA_DIR`). Both people use the same server and automatically see updates; no accounts or access control are implemented yet. Do not expose it publicly until an access-control choice is made.

## Included

- Search-first recipe discovery: search dishes or a main ingredient, browse photo ideas, open full instructions, save for both people or plan lunch/dinner. Uses TheMealDB V1 API; it is a catalogue, not a whole-web search. Attribution and original links are retained. Missing portions are explicitly flagged as provisional; missing cooking times are not invented.
- `MEALDB_API_KEY` optionally configures a provider key. Default `1` is TheMealDB's development/educational key. Check provider terms and obtain an appropriate key before a public release; an app-store release requires supporter access. Recipe imports from other sites remain available under Saved → Import a link or add your own. API requests and externally hosted photos are sent to the provider, not a private on-device search.

- Monday–Sunday week view, lunch and dinner only. Hold a meal, then drag or tap its destination; occupied meals swap. No copy-week feature.
- Shared saved recipes; manual creation/editing, image URL, ingredients, instructions, prep/cook time and source.
- Public recipe URL import using Schema.org Recipe JSON-LD. Review imports before saving. Sites without accessible structured data need manual entry; no paywall bypass. Imported photos remain externally hosted.
- Default two portions, scaling numeric ingredients from each recipe's original yield; text-only amounts stay unchanged. Imported yield may mean items rather than people, so check it.
- Single-recipe and selected-week shopping; editable amounts and names, untick existing cupboard ingredients without changing the recipe.
- Preview before sending to an existing shared Tally shopping list or a new shared recipe-named list. Normalised names and compatible units combine (g/kg, ml/l, tsp/tbsp); pack multipliers such as `500g ×2` are respected. Ranges require review rather than silently choosing a number. Blank quantities are unknown, not assumed to be one.
- Tally writes happen only after explicit confirmation. Simmer persists a prepared send before contacting Tally; Tally stores a request receipt atomically with the changes. A dropped response, concurrent retry or restart cannot apply the same send twice. The browser remembers an unconfirmed send and offers a safe retry after reload. Requires the matching Tally `/api/integrations/simmer` endpoint; older Tally versions fail closed.
- Search combines dish, ingredient and category matches; category/cuisine filters intersect the results. Search cards show saved status, and results/scroll position are remembered for the browser session. The week picker shows up to eight recipes at a time with search, so a large collection does not fill the dialog.
- Unknown original portions must be confirmed once before saving a discovered recipe, scaling, planning or shopping. Recipe photos appear in the calendar. Instructions are collapsed initially and split into shorter presentation steps without removing temperatures, timings or instruction text.
- Remove ingredients in a recipe view for the current shop only, with Restore available. In shopping review, exclusions and edited names/amounts survive portion and meal-selection changes; manually edited amounts stay fixed until changed again. Deleting recipes and removing meals offer Undo, valid for 60 seconds; restoring meals does not overwrite newer meal plans.

Set `TALLY_URL` to your Tally server (local default http://127.0.0.1:4188). Optional `TALLY_COOKIE` supplies an authenticated Tally session when needed; never commit it. Only shared shopping lists are offered, to avoid accidentally changing personal lists. Attribution currently uses Jason for Tally additions.

Run `npm test`. Docker deployment configuration uses a separate persistent volume; it does not replace Tally's data. No automatic public hosting or GitHub repository creation has been performed.

The first version requires a connection for saved changes. Browser install metadata is included; offline editing, cooking mode, user authentication and image upload are not included.

Importer format reference: https://schema.org/Recipe
