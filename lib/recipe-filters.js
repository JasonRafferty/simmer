export function mainIngredients(recipe){
 const title=String(recipe.name??''),lines=(recipe.ingredients??[]).filter(s=>! /\b(?:stock|broth|bouillon|gelatin|gelatine)\b/i.test(s));
 const proteins=[['Chicken',/\b(chicken)\b/i],['Beef',/\b(beef|steak|brisket)\b/i],['Lamb',/\b(lamb|mutton)\b/i],['Pork',/\b(pork|bacon|ham|prosciutto|pancetta|chorizo)\b/i],['Turkey',/\b(turkey)\b/i],['Duck',/\b(duck)\b/i],['Fish',/\b(fish|salmon|tuna|cod|haddock|trout|mackerel|sardines?|anchov(?:y|ies)|halibut|tilapia|swordfish)\b/i],['Seafood',/\b(seafood|prawns?|shrimp|scallops?|mussels?|clams?|lobster|crab|squid|calamari|octopus)\b/i]];
 const named=proteins.filter(([,p])=>p.test(title)).map(([n])=>n);if(named.length)return named;
 const meat=proteins.filter(([,p])=>lines.some(s=>p.test(s))).map(([n])=>n);if(meat.length)return meat;
 const plants=[['Tofu',/\b(tofu|tempeh)\b/i],['Beans & lentils',/\b(beans?|lentils?|chickpeas?|chana|dal)\b/i],['Mushrooms',/\b(mushrooms?|portobello|shiitake)\b/i],['Vegetables',/\b(potato(?:es)?|carrots?|cauliflower|broccoli|spinach|aubergine|eggplant|courgette|zucchini|squash|pumpkin|cabbage|peas?|tomato(?:es)?|peppers?|beetroot)\b/i],['Eggs',/\b(eggs?|omelette?|frittata)\b/i],['Cheese & dairy',/\b(cheese|paneer|ricotta|halloumi|mozzarella|yogh?urt)\b/i],['Fruit',/\b(apples?|bananas?|berries|berry|peach(?:es)?|pears?|plums?|mango|pineapple|oranges?|lemons?)\b/i],['Chocolate',/\b(chocolate|cocoa)\b/i],['Nuts',/\b(nuts?|almonds?|walnuts?|pecans?|pistachios?|cashews?|peanuts?)\b/i]];
 const prominent=plants.filter(([,p])=>p.test(title)).map(([n])=>n);if(prominent.length)return prominent;
 const fallback=plants.filter(([,p])=>lines.some(s=>p.test(s))).map(([n])=>n);return fallback.length?fallback:['Other ingredients'];
}

export const filterValues=value=>[...new Set([].concat(value??[]).map(String).filter(Boolean))];
export const tagMatches=(tags,selection)=>!filterValues(selection).length||filterValues(selection).some(value=>tags?.includes(value));
export const effortMatches=(recipe,effort)=>!filterValues(effort).length||Number.isInteger(recipe.ingredientCount)&&filterValues(effort).some(value=>value==='5'&&recipe.ingredientCount<=5||value==='6-10'&&recipe.ingredientCount>=6&&recipe.ingredientCount<=10||value==='11+'&&recipe.ingredientCount>=11);

export const adventureIdeas=['Shakshuka','Bibimbap','Gnocchi','Banh mi','Tagine','Okonomiyaki','Shawarma','Paella','Kimchi','Falafel','Bao','Ceviche','Bulgogi','Ramen','Pierogi','Laksa','Panzanella','Tostadas','Arepas','Gyoza','Satay','Ratatouille','Jambalaya','Empanadas','Dumplings','Moussaka','Tandoori','Enchiladas','Soba','Fattoush','Biryani','Pozole','Katsu','Chilaquiles','Schnitzel','Adobo','Spanakopita','Gochujang','Harissa','Poke'];
