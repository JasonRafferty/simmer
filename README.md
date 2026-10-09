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
- Preview before sending to an existing shared Tally shopping list or a new shared recipe-named list. Exact normalised names and compatible units combine (g/kg, ml/l, tsp/tbsp). Ambiguous matches are flagged, not silently overwritten. Blank quantities are unknown, not assumed to be one.
- Tally writes happen only after explicit confirmation. Version checks catch changes before sending; duplicate request IDs are stored after success. There is no distributed transaction across the two apps, so a connection failure after Tally accepts a request may require checking Tally before retrying. Avoid concurrent sends from both devices.

Set `TALLY_URL` to your Tally server (local default http://127.0.0.1:4188). Optional `TALLY_COOKIE` supplies an authenticated Tally session when needed; never commit it. Only shared shopping lists are offered, to avoid accidentally changing personal lists. Attribution currently uses Jason for Tally additions.

Run `npm test`. Docker deployment configuration uses a separate persistent volume; it does not replace Tally's data. No automatic public hosting or GitHub repository creation has been performed.

The first version requires a connection for saved changes. Browser install metadata is included; offline editing, cooking mode, user authentication and image upload are not included.

Importer format reference: https://schema.org/Recipe
