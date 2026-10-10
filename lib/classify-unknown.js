import {recipeTags} from './catalogue.js';

// Fill missing facets only. Never replace an existing classification or recipe content.
export function classifyUnknown(recipe){
 const result={...recipe};
 const unknown=(tags,label)=>!tags?.length||tags.every(tag=>tag===label);
 const title=String(recipe.name??'').normalize('NFKD').replace(/\p{M}/gu,'');
 const raw=[title,...[].concat(recipe.recipeCategory??[],recipe.keywords??[])].join(' ');
 const inferred=recipeTags({...recipe,tagsInferred:true});
 if(unknown(recipe.cuisines,'Not specified')){
  const cuisines=new Set(inferred.cuisines.filter(x=>x!=='Not specified'));
  for(const [name,pattern]of [
   ['Italian',/\b(?:frittata|bruschetta|tiramisu|panna cotta|osso buco|bolognese|pesto|arancini|polenta)\b/i],
   ['Mexican',/\b(?:gorditas?|enfrijoladas?|tostadas?|sopes|mole poblano|cafe de olla|elote|carnitas)\b/i],
   ['Japanese',/\b(?:dashi|onigiri|tempura|sushi|tonkatsu|sukiyaki)\b/i],
   ['Chinese',/\b(?:congee|wontons?|dumplings? kung pao|dan dan|lo mein|hoisin duck|peking duck)\b/i],
   ['French',/\b(?:quiche|clafoutis|creme brulee|tarte tatin|croque monsieur|nicoise)\b/i],
   ['South Asian',/\b(?:haleem|paneer|chhena poda|paratha|roti|samosas?|pakoras?|dosa|idli|saag|rogan josh)\b/i],
   ['Caribbean',/\b(?:trinidad|pelau|buss up shut|baigan chokha)\b/i],
   ['Middle Eastern',/\b(?:tabouli|tabbouli|fattoush|baba ghanou[sc]h|mujaddara)\b/i]
  ])if(pattern.test(title))cuisines.add(name);
  if(cuisines.size)result.cuisines=[...cuisines];
 }
 if(unknown(recipe.styles,'Other dishes')){
  const styles=new Set(inferred.styles.filter(x=>x!=='Other dishes'));
  for(const [name,pattern]of [
   ['Pasta dishes',/\b(?:mac and cheese|orzo|tagliatelle|rigatoni|tortellini|fusilli|bucatini|pappardelle)\b/i],
   ['Desserts & baking',/\b(?:cheesecakes?|parfaits?|crumbles?|cobblers?|shortbread|truffles?|meringues?|chocolate mousse|brookies?|blondies?|dutch baby)\b/i],
   ['Salads',/\b(?:slaw|panzanella|tabouli|tabbouleh|fattoush)\b/i],
   ['Soups',/\b(?:borscht|bisque|minestrone|gazpacho|vichyssoise)\b/i],
   ['Curries',/\b(?:curried|tikka masala|rogan josh|rendang|saag|vindaloo)\b/i],
   ['Stews',/\b(?:braised|braise|cassoulet|bourguignon|haleem|goulash|chili con carne|chilli con carne)\b/i],
   ['Sandwiches & burgers',/\b(?:sliders?|toasties?|panini|banh mi|sloppy joe)\b/i],
   ['Rice dishes',/\b(?:pilaf|pilau|pelau|congee|jambalaya)\b/i],
   ['Roasts & baked dishes',/\b(?:roast(?:ed)?|baked|gratin|scalloped)\b/i],
   ['Breads & flatbreads',/\b(?:bread|focaccia|pita|naan|roti|paratha|bagels?|biscuits?|scones?|rolls|cornbread)\b/i],
   ['Egg dishes',/\b(?:frittata|omele[ t]*te?|shakshuka|scrambled eggs|baked eggs|shirred eggs|deviled eggs|devilled eggs)\b/i],
   ['Drinks',/\b(?:cocktails?|mocktails?|smoothies?|lemonade|refresher|hot toddy|iced coffee|iced tea|milkshakes?|sangria|margarita|martini|mojito)\b/i],
   ['Sauces & dips',/\b(?:sauce|salsa|dips?|dressing|marinade|pesto|chutney|relish|hummus|tzatziki|guacamole|aioli|seasoning|curry powder)\b/i]
  ])if(pattern.test(raw)&&!(name==='Breads & flatbreads'&&/\b(?:stuffing|bread pudding|breaded)\b/i.test(title)))styles.add(name);
  // Ingredient evidence is useful for pasta/noodles, but not enough to guess cuisine.
  if(!styles.size){const ingredients=(recipe.ingredients??[]).join(' ');if(/\b(?:spaghetti|penne|rigatoni|fettuccine|tagliatelle|macaroni|tortellini)\b/i.test(ingredients))styles.add('Pasta dishes');else if(/\b(?:rice noodles|egg noodles|udon|soba|ramen noodles)\b/i.test(ingredients))styles.add('Noodles');}
  if(styles.size)result.styles=[...styles];
 }
 return result;
}
