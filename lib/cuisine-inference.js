const normalise=value=>String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
// Dish names and regional ingredient combinations indicate style, not authenticity.
// Generic ingredients alone (rice, chicken, garlic, olive oil) never assign a cuisine.
const dishes=[
 ['Italian',/\b(?:pizza|focaccia|ciabatta|panettone|biscotti|amaretti|cannoli|gnudi|caprese|puttanesca|arrabbiata|amatriciana|piccata|saltimbocca|marsala|vitello tonnato|bagna cauda|ribollita|stracciatella|crostini|antipast[oi]|prosciutto|porchetta|zabaglione|semifreddo|gelato)\b/],
 ['French',/\b(?:brioche|baguette|croissant|beignet|galette|souffle|crepes?|creme caramel|pot de creme|pate de fruit|dauphinois[e]?|au vin|au poivre|au gratin|beurre blanc|tapenade|remoulade|rillettes|confit|fricassee|gougeres?|pissaladiere|madeleines?|financiers?|tuiles?|mille feuille|profiteroles?|eclairs?)\b/],
 ['British',/\b(?:shepherd'?s pie|cottage pie|fish and chips|yorkshire pudding|toad in the hole|bubble and squeak|eton mess|sticky toffee|lemon drizzle|victoria sponge|hot cross buns?|bread and butter pudding|welsh rarebit|scotch eggs?|eccles cakes?|treacle tart|kedgeree|spotted dick|coronation chicken)\b/],
 ['American',/\b(?:brownies?|blondies?|chocolate chip cookies?|cornbread|pecan pie|key lime pie|s'?mores|buffalo wings?|buffalo chicken|sloppy joes?|cobb salad|waldorf salad|thanksgiving|succotash|hush puppies|pulled pork|clam chowder|boston baked beans|philly cheesesteak|chicken fried steak|red velvet|banana pudding)\b/],
 ['Cajun',/\b(?:gumbo|jambalaya|etouffee|creole|po'?boys?|muffuletta)\b/],
 ['Mexican',/\b(?:posole|tortilla soup|chile relleno|chiles rellenos|al pastor|cochinita pibil|barbacoa|fajitas?|burritos?|guacamole|pico de gallo|salsa roja|churros?|tres leches|horchata|chilaquiles)\b/],
 ['Spanish',/\b(?:tortilla espanola|albondigas|romesco|escalivada|salmorejo|chorizo al vino|croquetas?|pan con tomate|pimientos de padron)\b/],
 ['Portuguese',/\b(?:bacalhau|caldo verde|pasteis de nata|piri piri|peri peri)\b/],
 ['Greek',/\b(?:souvlaki|avgolemono|saganaki|dolmades|pastitsio|skordalia|tiropita|greek salad)\b/],
 ['Middle Eastern',/\b(?:shakshuka|labneh|zaatar|za'atar|manakish|kibbeh|kofta|kofte|fattoush|freekeh|haroseth|charoset|matzo|matzah|challah|latkes?|kugel|rugelach|hamantaschen|sabich)\b/],
 ['Turkish',/\b(?:borek|gozleme|cilbir|iskender|imam bayildi)\b/],
 ['Moroccan',/\b(?:harira|chermoula|ras el hanout|bastilla|pastilla)\b/],
 ['Persian',/\b(?:fesenjan|kuku sabzi|zereshk|joojeh|ash reshteh)\b/],
 ['Indian',/\b(?:chaat|bhel puri|pani puri|pav bhaji|puri|uttapam|aloo gobi|malai kofta|rajma|butter chicken|murgh makhani|sambar|rasam|kulfi|gulab jamun|jalebi|kheer)\b/],
 ['South Asian',/\b(?:chapati|chappati|naan|bhaji|bhuna|jalfrezi|madras|dhansak|keema|khichdi|pakora|chicken karahi)\b/],
 ['Sri Lankan',/\b(?:pol sambol|kottu|kiribath|hoppers)\b/],
 ['Thai',/\b(?:larb|laab|som tam|massaman|panang|nam prik|thai basil|green curry|red curry|yellow curry)\b/],
 ['Vietnamese',/\b(?:bun cha|bun bo|bo kho|goi cuon|ca kho|nuoc mam)\b/],
 ['Chinese',/\b(?:dim sum|bao|baozi|jiaozi|siu mai|shumai|hot and sour|egg drop soup|five spice|five-spice|wonton|scallion pancakes?|spring rolls?|sweet and sour pork|sweet and sour chicken|general tso|mongolian beef|orange chicken|black bean sauce|moo shu|chow fun)\b/],
 ['Japanese',/\b(?:negimaki|donburi|oyakodon|gyudon|katsu|chawanmushi|furikake|shabu shabu|yaki udon|yaki soba|yakisoba|ponzu|miso)\b/],
 ['Korean',/\b(?:japchae|tteokbokki|galbi|kalbi|banchan|doenjang|gochugaru|jjigae|kimbap)\b/],
 ['Indonesian',/\b(?:nasi goreng|mie goreng|gado gado|sambal matah|balinese)\b/],
 ['Malaysian',/\b(?:laksa|nasi lemak|char kway teow|roti canai)\b/],
 ['Southeast Asian',/\b(?:satay|rendang|sambal)\b/],
 ['Filipino',/\b(?:arroz caldo|pancit|lumpia|sinigang|sisig|chicken adobo|pork adobo|ginataan|kare kare)\b/],
 ['Hawaiian',/\b(?:poke|loco moco|kalua pork|huli huli)\b/],
 ['Jamaican',/\b(?:jerk chicken|jerk pork|jerk seasoning|ackee|escovitch)\b/],
 ['Caribbean',/\b(?:callaloo|saltfish|rice and peas|pepperpot)\b/],
 ['Brazilian',/\b(?:feijoada|moqueca|pao de queijo|brigadeiro)\b/],
 ['Peruvian',/\b(?:lomo saltado|aji de gallina|causa limena)\b/],
 ['Latin American',/\b(?:ceviche|empanadas?|arepas?|arroz con pollo|dulce de leche|chimichurri|alfajores)\b/],
 ['Eastern European',/\b(?:borscht|borsch|pierogi|pelmeni|vareniki|blini|stroganoff|goulash|paprikash|golabki|sauerkraut)\b/],
 ['German',/\b(?:spaetzle|spatzle|sauerbraten|schnitzel|stollen|pfeffernusse|lebkuchen|bratwurst)\b/],
 ['Scandinavian',/\b(?:gravlax|gravadlax|smorrebrod|lefse|aebleskiver|swedish meatballs)\b/],
 ['West African',/\b(?:jollof|suya|shito|egusi|groundnut stew|maafe)\b/],
 ['Ethiopian',/\b(?:misir wat|shiro|tibs|kitfo)\b/]
];
export function inferAdditionalCuisines(recipe){
 const title=normalise(recipe.name),ingredients=normalise((recipe.ingredients??[]).join(' '));
 const metadata=normalise([].concat(recipe.recipeCuisine??[],recipe.keywords??[]).join(' '));
 const found=new Set();
 for(const [cuisine,pattern]of dishes)if(pattern.test(title)||new RegExp('\\b'+cuisine.toLowerCase()+'\\b').test(metadata))found.add(cuisine);
 if(found.size)return [...found];
 const all=(...patterns)=>patterns.every(p=>p.test(ingredients));
 if(all(/\b(?:pasta|spaghetti|penne|rigatoni|linguine|fettuccine|ravioli|tortellini)\b/,/\b(?:tomato|tomatoes|parmesan|pecorino)\b/,/\b(?:basil|oregano|pancetta|prosciutto)\b/))found.add('Italian');
 if(all(/\b(?:tortillas?|masa harina)\b/,/\b(?:chipotle|ancho|poblano|tomatillo|jalapeno)\b/,/\b(?:cilantro|cumin|black beans|pinto beans)\b/))found.add('Mexican');
 if(all(/\b(?:garam masala|curry leaves|fenugreek|kasuri methi)\b/,/\b(?:turmeric|cumin|coriander)\b/,/\b(?:ginger|cardamom|ghee)\b/))found.add('South Asian');
 if(all(/\b(?:lemongrass|galangal|kaffir lime|makrut lime)\b/,/\b(?:fish sauce|shrimp paste)\b/,/\b(?:coconut milk|coconut cream|thai basil)\b/))found.add('Southeast Asian');
 if(all(/\b(?:soy sauce|tamari)\b/,/\bginger\b/,/\b(?:sesame oil|rice vinegar)\b/,/\b(?:scallions?|spring onions?|bok choy)\b/))found.add('East Asian');
 if(all(/\b(?:tahini|sumac|pomegranate molasses|zaatar|za'atar)\b/,/\b(?:chickpeas?|eggplant|aubergine|bulgur)\b/,/\b(?:parsley|mint|cumin)\b/))found.add('Middle Eastern');
 if(all(/\b(?:feta|halloumi)\b/,/\b(?:olives?|olive oil)\b/,/\b(?:oregano|mint|dill)\b/,/\b(?:lemon|cucumber|tomatoes?)\b/))found.add('Mediterranean');
 return [...found];
}
