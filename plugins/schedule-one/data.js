// Game data, copied from the Schedule I Helper. MAX_EFFECTS is the in-game cap on effects per product.
const MAX_EFFECTS = 8;
const GROUPS = ['Hippies', 'Businessmen', 'Party Bus', 'Bikers'];
const DRUGS = [{"name":"Weed","price":35},{"name":"Meth","price":70},{"name":"Cocaine","price":150},{"name":"Shrooms","price":80}];
const EFFECTS = {"Anti-Gravity":1.54,"Athletic":1.32,"Balding":1.3,"Bright-Eyed":1.4,"Calming":1.1,"Calorie-Dense":1.28,"Cyclopean":1.56,"Disorienting":1,"Electrifying":1.5,"Energizing":1.22,"Euphoric":1.18,"Explosive":1,"Focused":1.16,"Foggy":1.36,"Gingeritis":1.2,"Glowing":1.48,"Jennerising":1.42,"Laxative":1,"Lethal":1,"Long Faced":1.52,"Munchies":1.12,"Paranoia":1,"Refreshing":1.14,"Schizophrenic":1,"Sedating":1.26,"Seizure-Inducing":1,"Shrinking":1.6,"Slippery":1.34,"Smelly":1,"Sneaky":1.24,"Spicy":1.38,"Thought-Provoking":1.44,"Toxic":1,"Tropic Thunder":1.46,"Zombifying":1.58};
const INGREDIENTS = [{"name":"Cuke","price":2,"base":"Energizing","rep":{"Euphoric":"Laxative","Foggy":"Cyclopean","Gingeritis":"Thought-Provoking","Munchies":"Athletic","Slippery":"Munchies","Sneaky":"Paranoia","Toxic":"Euphoric"}},{"name":"Banana","price":2,"base":"Gingeritis","rep":{"Calming":"Sneaky","Cyclopean":"Thought-Provoking","Disorienting":"Focused","Energizing":"Thought-Provoking","Focused":"Seizure-Inducing","Long Faced":"Refreshing","Paranoia":"Jennerising","Smelly":"Anti-Gravity","Toxic":"Smelly"}},{"name":"Paracetamol","price":3,"base":"Sneaky","rep":{"Calming":"Slippery","Electrifying":"Athletic","Energizing":"Paranoia","Focused":"Gingeritis","Foggy":"Calming","Glowing":"Toxic","Munchies":"Anti-Gravity","Paranoia":"Balding","Spicy":"Bright-Eyed","Toxic":"Tropic Thunder"}},{"name":"Donut","price":3,"base":"Calorie-Dense","rep":{"Anti-Gravity":"Slippery","Balding":"Sneaky","Calorie-Dense":"Explosive","Focused":"Euphoric","Jennerising":"Gingeritis","Munchies":"Calming","Shrinking":"Energizing"}},{"name":"Viagra","price":4,"base":"Tropic Thunder","rep":{"Athletic":"Sneaky","Disorienting":"Toxic","Euphoric":"Bright-Eyed","Laxative":"Calming","Shrinking":"Gingeritis"}},{"name":"Mouth Wash","price":4,"base":"Balding","rep":{"Calming":"Anti-Gravity","Calorie-Dense":"Sneaky","Explosive":"Sedating","Focused":"Jennerising"}},{"name":"Flu Medicine","price":5,"base":"Sedating","rep":{"Athletic":"Munchies","Calming":"Bright-Eyed","Cyclopean":"Foggy","Electrifying":"Refreshing","Euphoric":"Toxic","Focused":"Calming","Laxative":"Euphoric","Munchies":"Slippery","Shrinking":"Paranoia","Thought-Provoking":"Gingeritis"}},{"name":"Gasoline","price":5,"base":"Toxic","rep":{"Disorienting":"Glowing","Electrifying":"Disorienting","Energizing":"Euphoric","Euphoric":"Spicy","Gingeritis":"Smelly","Jennerising":"Sneaky","Laxative":"Foggy","Munchies":"Sedating","Paranoia":"Calming","Shrinking":"Focused","Sneaky":"Tropic Thunder"}},{"name":"Energy Drink","price":6,"base":"Athletic","rep":{"Disorienting":"Electrifying","Euphoric":"Energizing","Focused":"Shrinking","Foggy":"Laxative","Glowing":"Disorienting","Schizophrenic":"Balding","Sedating":"Munchies","Spicy":"Euphoric","Tropic Thunder":"Sneaky"}},{"name":"Motor Oil","price":6,"base":"Slippery","rep":{"Energizing":"Munchies","Euphoric":"Sedating","Foggy":"Toxic","Munchies":"Schizophrenic","Paranoia":"Anti-Gravity"}},{"name":"Mega Bean","price":7,"base":"Foggy","rep":{"Athletic":"Laxative","Calming":"Glowing","Energizing":"Cyclopean","Focused":"Disorienting","Jennerising":"Paranoia","Seizure-Inducing":"Focused","Shrinking":"Electrifying","Slippery":"Toxic","Sneaky":"Calming","Thought-Provoking":"Energizing"}},{"name":"Chili","price":7,"base":"Spicy","rep":{"Anti-Gravity":"Tropic Thunder","Athletic":"Euphoric","Laxative":"Long Faced","Munchies":"Toxic","Shrinking":"Refreshing","Sneaky":"Bright-Eyed"}},{"name":"Battery","price":8,"base":"Bright-Eyed","rep":{"Cyclopean":"Glowing","Electrifying":"Euphoric","Euphoric":"Zombifying","Laxative":"Calorie-Dense","Munchies":"Tropic Thunder","Shrinking":"Munchies"}},{"name":"Iodine","price":8,"base":"Jennerising","rep":{"Calming":"Balding","Calorie-Dense":"Gingeritis","Euphoric":"Seizure-Inducing","Foggy":"Paranoia","Refreshing":"Thought-Provoking","Toxic":"Sneaky"}},{"name":"Addy","price":9,"base":"Thought-Provoking","rep":{"Explosive":"Euphoric","Foggy":"Energizing","Glowing":"Refreshing","Long Faced":"Electrifying","Sedating":"Gingeritis"}},{"name":"Horse Semen","price":9,"base":"Long Faced","rep":{"Anti-Gravity":"Calming","Gingeritis":"Refreshing","Thought-Provoking":"Electrifying","Seizure-Inducing":"Energizing"}}];
// Starting customer notes; edits are saved in this plugin's own storage and win over these.
const SEED = {
 "Party Bus": {
  "location": "at the blown up rv",
  "drugs": [
   "Weed",
   "Shrooms"
  ],
  "notes": "",
  "mixes": [
   {
    "name": "Mix",
    "ingredients": [
     "Cuke",
     "Mega Bean",
     "Motor Oil",
     "Addy",
     "Battery",
     "Horse Semen",
     "Banana"
    ]
   }
  ]
 },
 "Bikers": {
  "location": "next to the statue in Westville",
  "drugs": [
   "Meth",
   "Weed"
  ],
  "notes": "",
  "mixes": [
   {
    "name": "Meth / Green Crack / Sour Diesel / OG Kush",
    "ingredients": [
     "Flu Medicine",
     "Donut",
     "Donut",
     "Energy Drink",
     "Motor Oil",
     "Chili",
     "Iodine",
     "Mega Bean",
     "Mega Bean"
    ]
   },
   {
    "name": "Granddaddy Purple",
    "ingredients": [
     "Donut",
     "Donut",
     "Energy Drink",
     "Motor Oil",
     "Chili",
     "Iodine",
     "Mega Bean",
     "Mega Bean"
    ]
   }
  ]
 },
 "Businessmen": {
  "location": "",
  "drugs": [
   "Cocaine",
   "Meth"
  ],
  "notes": "",
  "mixes": [
   {
    "name": "Cocaine",
    "ingredients": [
     "Gasoline",
     "Cuke",
     "Iodine",
     "Paracetamol",
     "Mega Bean",
     "Mouth Wash",
     "Addy"
    ]
   }
  ]
 },
 "Hippies": {
  "location": "",
  "drugs": [],
  "notes": "",
  "mixes": []
 }
};
