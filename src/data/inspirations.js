/**
 * Theme Genesis: "What's it inspired by?"
 *
 * A child types an idea ("racing", "a game I love", "dinosaurs in space")
 * and taps "Make it"; the Spark step fills in a whole starting theme from it
 * (a name, a vibe, three colours, a pattern, a mascot, the four worlds and
 * the coins), every bit of which they can then change in the later steps.
 *
 * Everything happens here, on the phone, from the library below. No AI and
 * no network: what a child types is never sent anywhere, never stored and
 * never shown back. Only the theme it picks is kept, as the same small
 * design any theme is (src/data/themeGenesis.js), so this library ships in
 * the app and is never in the data.
 *
 * Each topic is generic and kid-friendly. Brand and game names are only ever
 * ALIASES (BRAND_ALIASES), so "f1" gives Racing and "minecraft" gives Blocky
 * World, and the theme it makes never carries the brand. Games for older
 * players are mapped to a topic with nothing about crime, weapons or fighting
 * in it ("gta" gives City Nights: a neon city, cars and skyscrapers), and
 * tests/genesiswords.mjs checks no topic says anything of the kind.
 *
 * With no match, the closest topic by the words in common; failing that,
 * "Something new". A rude idea gets the same gentle refusal as a rude name.
 */

import { VIBE_MAP, NAME_MAX } from './themeGenesis.js'
import { wordsOk, plainWords } from '../lib/kidWords.js'

/**
 * The topics, in the order a tie is settled. `words` are the plain words
 * and phrases that lead to it; `says` is the short friendly line after the
 * label ("Racing vibes: checkered flags, red and black, 🏎️").
 */
export const TOPICS = [
  {
    id: 'racing', label: 'Racing', vibe: 'new', bg: '#141414', a: '#ff1e1e', a2: '#f5f5f5', pat: 'checkers', mascot: '🏎️',
    says: 'checkered flags, red and black', cur: 'Turbo Coins',
    names: ['Speed Circuit', 'Pit Lane Pros', 'Turbo Rush'], worlds: ['Pit Lane', 'Hairpin Bend', 'Night Race', 'Victory Lap'],
    words: ['racing', 'race', 'racer', 'race car', 'racecar', 'car', 'cars', 'fast cars', 'grand prix', 'go kart', 'go karts',
      'karting', 'speed', 'fast', 'drift', 'drifting', 'motorsport', 'rally', 'pit stop', 'finish line', 'supercar'],
  },
  {
    id: 'carsoccer', label: 'Car Soccer', vibe: 'new', bg: '#0b1a3a', a: '#ff8a00', a2: '#3aa0ff', pat: 'stripes', mascot: '🏎️',
    says: 'rocket cars, a giant ball, orange and blue', cur: 'Boost Points',
    names: ['Boost Ball', 'Turbo Goals', 'Car Ball Cup'], worlds: ['Training Field', 'Boost Arena', 'Sky Dome', 'Champion Pitch'],
    words: ['car soccer', 'car football', 'rocket cars', 'car ball', 'boost'],
  },
  {
    id: 'football', label: 'Football', vibe: 'new', bg: '#0d3b1e', a: '#7ee081', a2: '#ffd23f', pat: 'stripes', mascot: '⚽',
    says: 'green pitches, big goals, cheering crowds', cur: 'Goals',
    names: ['Golden Boot', 'Pitch Masters', 'Top Corner'], worlds: ['Local Park', 'Town Stadium', 'Cup Final', 'World Stage'],
    words: ['football', 'soccer', 'goal', 'goals', 'striker', 'goalkeeper', 'keeper', 'pitch', 'penalty', 'world cup',
      'kick', 'footy', 'football club'],
  },
  {
    id: 'gridiron', label: 'American Football', vibe: 'new', bg: '#1b1f3b', a: '#ff6b35', a2: '#e5e7eb', pat: 'stripes', mascot: '🏈',
    says: 'touchdowns, stadium lights, team colours', cur: 'Touchdowns',
    names: ['End Zone', 'Gridiron Glory', 'Huddle Up'], worlds: ['Practice Field', 'Home Stadium', 'Playoff Night', 'Big Game'],
    words: ['american football', 'touchdown', 'touchdowns', 'quarterback', 'gridiron', 'end zone', 'huddle'],
  },
  {
    id: 'basketball', label: 'Basketball', vibe: 'new', bg: '#1a0f08', a: '#ff7a1a', a2: '#4cc9f0', pat: 'dots', mascot: '🏀',
    says: 'hoops, slam dunks, orange and court wood', cur: 'Hoop Points',
    names: ['Slam Dunk City', 'Hoop Dreams', 'Full Court'], worlds: ['Driveway Hoop', 'School Gym', 'City Court', 'Big Arena'],
    words: ['basketball', 'hoops', 'hoop', 'dunk', 'slam dunk', 'dribble', 'b ball', 'netball'],
  },
  {
    id: 'baseball', label: 'Baseball', vibe: 'new', bg: '#0d2240', a: '#e63946', a2: '#f1faee', pat: 'stripes', mascot: '⚾',
    says: 'home runs, sunny diamonds, red stitches', cur: 'Home Runs',
    names: ['Home Run Heroes', 'Diamond Days', 'Grand Slam'], worlds: ['Backyard', 'Little League', 'Night Game', 'Grand Slam Park'],
    words: ['baseball', 'softball', 'home run', 'home runs', 'pitcher', 'batter', 'diamond', 'rounders', 'cricket'],
  },
  {
    id: 'tennis', label: 'Tennis', vibe: 'new', bg: '#0f3d2e', a: '#d4ff3a', a2: '#ffffff', pat: 'stripes', mascot: '🏆',
    says: 'fuzzy yellow balls, grass courts', cur: 'Aces',
    names: ['Ace Court', 'Match Point', 'Love All'], worlds: ['Practice Wall', 'Club Court', 'Clay Court', 'Centre Court'],
    words: ['tennis', 'badminton', 'ping pong', 'table tennis', 'racket', 'racquet', 'serve', 'pickleball', 'squash'],
  },
  {
    id: 'skate', label: 'Skate Park', vibe: 'new', bg: '#1d1d2b', a: '#ff4d8d', a2: '#3ef0c8', pat: 'zigzag', mascot: '🛹',
    says: 'ramps, tricks and bright stickers', cur: 'Trick Points',
    names: ['Kickflip City', 'Ramp Riders', 'Half Pipe Heroes'], worlds: ['Driveway Ramp', 'Skate Park', 'Half Pipe', 'Mega Ramp'],
    words: ['skate', 'skating', 'skateboard', 'skateboarding', 'skatepark', 'skate park', 'bmx', 'scooter', 'scooters',
      'roller skates', 'rollerblades', 'tricks', 'kickflip', 'bike', 'bikes', 'cycling'],
  },
  {
    id: 'sports', label: 'Sports Day', vibe: 'new', bg: '#1a1033', a: '#ffd166', a2: '#7cc4ff', pat: 'confetti', mascot: '🏆',
    says: 'gold medals, podiums and big cheers', cur: 'Medals',
    names: ['Medal Rush', 'Champion Games', 'Podium Party'], worlds: ['Warm Up', 'Running Track', 'Big Stadium', 'Gold Podium'],
    words: ['sport', 'sports', 'sports day', 'athletics', 'running', 'runner', 'medal', 'medals', 'champion', 'champions',
      'trophy', 'trophies', 'gymnastics', 'swimming', 'hockey', 'rugby', 'volleyball', 'golf', 'team'],
  },
  {
    id: 'space', label: 'Space', vibe: 'space', bg: '#0b0f2e', a: '#7cc4ff', a2: '#ffd166', pat: 'stars', mascot: '🚀',
    says: 'twinkling stars, rockets and far planets', cur: 'Star Bits',
    names: ['Star Voyage', 'Rocket Crew', 'Cosmic Quest'], worlds: ['Moon Base', 'Asteroid Belt', 'Ring Planet', 'Edge of Space'],
    words: ['space', 'outer space', 'rocket', 'rockets', 'astronaut', 'astronauts', 'planet', 'planets', 'star', 'stars',
      'galaxy', 'galaxies', 'moon', 'mars', 'solar system', 'cosmic', 'comet', 'spaceship', 'rocket ship', 'universe', 'nebula'],
  },
  {
    id: 'machines', label: 'Big Machines', vibe: 'robots', bg: '#1c1917', a: '#facc15', a2: '#38bdf8', pat: 'stripes', mascot: '🚂',
    says: 'steam trains, diggers and giant trucks', cur: 'Gold Bolts',
    names: ['Full Steam', 'Big Wheels', 'Dig Site'], worlds: ['Station Yard', 'Dig Site', 'Mountain Tunnel', 'Grand Station'],
    words: ['train', 'trains', 'railway', 'railways', 'railroad', 'steam train', 'station', 'truck', 'trucks', 'monster truck',
      'monster trucks', 'digger', 'diggers', 'excavator', 'construction', 'bulldozer', 'crane', 'cranes', 'fire engine',
      'fire truck', 'vehicles', 'big machines'],
  },
  {
    id: 'aliens', label: 'Alien Planet', vibe: 'space', bg: '#0a1a12', a: '#7cff6b', a2: '#c084fc', pat: 'bubbles', mascot: '🛸',
    says: 'flying saucers, green glow, a friendly crew', cur: 'Glow Gems',
    names: ['Planet Zorp', 'Saucer Squad', 'Little Green Crew'], worlds: ['Landing Pad', 'Crystal Craters', 'Glow Swamp', 'Mothership'],
    words: ['alien', 'aliens', 'ufo', 'ufos', 'flying saucer', 'martian', 'martians', 'extraterrestrial', 'space crew'],
  },
  {
    id: 'dinosaurs', label: 'Dinosaurs', vibe: 'jungle', bg: '#1b2a10', a: '#9be15d', a2: '#ff9f1c', pat: 'leaves', mascot: '🦖',
    says: 'giant footprints, ferns and smoky volcanoes', cur: 'Dino Eggs',
    names: ['Dino Valley', 'Stomp Land', 'Fossil Quest'], worlds: ['Fern Forest', 'Tar Pits', 'Fossil Canyon', 'Volcano Peak'],
    words: ['dinosaur', 'dinosaurs', 'dino', 'dinos', 't rex', 'trex', 'tyrannosaurus', 'triceratops', 'raptor', 'raptors',
      'fossil', 'fossils', 'jurassic', 'prehistoric', 'stegosaurus', 'pterodactyl'],
  },
  {
    id: 'ocean', label: 'Ocean', vibe: 'ocean', bg: '#052a3a', a: '#3ee0d0', a2: '#ffb3c1', pat: 'waves', mascot: '🐬',
    says: 'rolling waves, coral and dolphins', cur: 'Pearls',
    names: ['Deep Blue', 'Wave Riders', 'Reef Quest'], worlds: ['Coral Reef', 'Kelp Forest', 'Shipwreck Bay', 'The Deep'],
    words: ['ocean', 'oceans', 'sea', 'seas', 'underwater', 'under the sea', 'fish', 'fishes', 'dolphin', 'dolphins', 'whale',
      'whales', 'coral', 'reef', 'mermaid', 'mermaids', 'seahorse', 'sea life', 'aquarium', 'water'],
  },
  {
    id: 'deepsea', label: 'Deep Sea', vibe: 'ocean', bg: '#050b2a', a: '#7b61ff', a2: '#3ee0d0', pat: 'bubbles', mascot: '🐙',
    says: 'glowing jellies, curly octopus arms, the deep dark', cur: 'Glow Pearls',
    names: ['Abyss Explorers', 'Deep Glow', 'Octo Depths'], worlds: ['Twilight Zone', 'Jelly Garden', 'Trench Caves', 'Deepest Deep'],
    words: ['deep sea', 'octopus', 'octopuses', 'squid', 'jellyfish', 'submarine', 'submarines', 'abyss', 'anglerfish', 'trench'],
  },
  {
    id: 'sharks', label: 'Sharks', vibe: 'ocean', bg: '#062033', a: '#4fc3f7', a2: '#ffca3a', pat: 'waves', mascot: '🦈',
    says: 'fins, deep blue water and coral caves', cur: 'Shark Teeth',
    names: ['Shark Reef', 'Fin Club', 'Big Blue'], worlds: ['Shallow Lagoon', 'Coral Caves', 'Open Ocean', 'Shark Reef'],
    words: ['shark', 'sharks', 'hammerhead', 'great white', 'fin', 'fins'],
  },
  {
    id: 'beach', label: 'Beach Days', vibe: 'ocean', bg: '#fff4d6', a: '#0077b6', a2: '#e76f51', pat: 'waves', mascot: '🦀',
    says: 'sandy toes, surf and sunshine', cur: 'Seashells',
    names: ['Sunny Shores', 'Surf Club', 'Sandcastle Bay'], worlds: ['Rock Pools', 'Sandy Cove', 'Surf Point', 'Treasure Island'],
    words: ['beach', 'beaches', 'summer', 'surf', 'surfing', 'surfer', 'sand', 'sandcastle', 'island', 'islands', 'tropical',
      'holiday', 'vacation', 'seaside', 'sunshine', 'sun', 'turtle', 'turtles'],
  },
  {
    id: 'pirates', label: 'Pirates', vibe: 'ocean', bg: '#1b1424', a: '#f2c14e', a2: '#4ecdc4', pat: 'waves', mascot: '🦜',
    says: 'treasure maps, tall ships and a parrot pal', cur: 'Gold Doubloons',
    names: ['Treasure Tides', 'Parrot Cove', 'High Seas Crew'], worlds: ['Harbour Town', 'Parrot Island', 'Foggy Straits', 'Treasure Cave'],
    words: ['pirate', 'pirates', 'treasure', 'treasure map', 'ship', 'ships', 'sailing', 'sailor', 'captain', 'parrot',
      'parrots', 'gold coins', 'tall ship'],
  },
  {
    id: 'citynights', label: 'City Nights', vibe: 'robots', bg: '#0d0a24', a: '#ff3cac', a2: '#2bd2ff', pat: 'dots', mascot: '🌃',
    says: 'a neon city, cars and skyscrapers', cur: 'Neon Bucks',
    names: ['City Nights', 'Neon Skyline', 'Midnight Drive'], worlds: ['Downtown', 'Neon Strip', 'Skyscraper Row', 'Rooftop Lights'],
    words: ['city', 'cities', 'city nights', 'night city', 'neon', 'neon lights', 'skyscraper', 'skyscrapers', 'downtown',
      'skyline', 'street', 'streets', 'night drive', 'big city', 'town', 'urban', 'taxi'],
  },
  {
    id: 'blocky', label: 'Blocky World', vibe: 'robots', bg: '#16233a', a: '#6abe30', a2: '#8fd3ff', pat: 'checkers', mascot: '🧱',
    says: 'chunky blocks, grassy cubes and endless building', cur: 'Gems',
    names: ['Block Builders', 'Cube Kingdom', 'Pixel Plains'], worlds: ['Grass Plains', 'Deep Caves', 'Block Mountains', 'Sky Islands'],
    words: ['blocky', 'blocks', 'block', 'block world', 'cubes', 'cube', 'voxel', 'crafting', 'craft', 'mining',
      'building', 'build', 'builder', 'sandbox', 'bricks', 'brick', 'pixel world'],
  },
  {
    id: 'partyisland', label: 'Party Island', vibe: 'new', bg: '#1d0b33', a: '#c084fc', a2: '#5eead4', pat: 'confetti', mascot: '🎮',
    says: 'colourful islands, dance moves and a party bus', cur: 'Party Bucks',
    names: ['Party Island', 'Dance Drop', 'Island Hop'], worlds: ['Bus Stop', 'Dance Beach', 'Treehouse Town', 'Island Party'],
    words: ['party', 'party island', 'emote', 'emotes', 'party bus', 'island hopping', 'skins', 'lobby'],
  },
  {
    id: 'ninjas', label: 'Ninjas', vibe: 'new', bg: '#121212', a: '#ff4d4d', a2: '#ffd166', pat: 'zigzag', mascot: '🐼',
    says: 'shadowy rooftops, quiet steps and a secret dojo', cur: 'Ninja Scrolls',
    names: ['Shadow Dojo', 'Silent Steps', 'Ninja Academy'], worlds: ['Training Dojo', 'Bamboo Woods', 'Moonlit Roofs', 'Mountain Temple'],
    words: ['ninja', 'ninjas', 'dojo', 'stealth', 'sneaky', 'sneaking', 'shadow', 'shadows', 'karate', 'martial arts',
      'kung fu', 'samurai', 'judo', 'taekwondo', 'secret agent', 'spy', 'spies'],
  },
  {
    id: 'castles', label: 'Castles', vibe: 'new', bg: '#1f1640', a: '#ffd166', a2: '#c084fc', pat: 'stars', mascot: '🏰',
    says: 'tall towers, banners and a royal feast', cur: 'Gold Crowns',
    names: ['Royal Realm', 'Castle Quest', 'Crown Keep'], worlds: ['Village Gate', 'Castle Courtyard', 'Tall Tower', 'Throne Room'],
    words: ['castle', 'castles', 'knight', 'knights', 'kingdom', 'kingdoms', 'king', 'queen', 'princess', 'princesses',
      'prince', 'royal', 'medieval', 'palace', 'crown', 'fairy tale', 'fairytale'],
  },
  {
    id: 'dragons', label: 'Dragons', vibe: 'new', bg: '#2a0b0b', a: '#ff6b35', a2: '#ffd23f', pat: 'zigzag', mascot: '🐉',
    says: 'scaly wings, warm caves and golden hoards', cur: 'Dragon Gold',
    names: ['Dragon Peaks', 'Wing Riders', 'Ember Valley'], worlds: ['Egg Hatchery', 'Ember Caves', 'Cloud Cliffs', 'Dragon Summit'],
    words: ['dragon', 'dragons', 'wyvern', 'dragon rider', 'dragon egg', 'fantasy', 'mythical', 'myths', 'legends'],
  },
  {
    id: 'superheroes', label: 'Superheroes', vibe: 'new', bg: '#0b1d4f', a: '#e63946', a2: '#ffd166', pat: 'zigzag', mascot: '🦸',
    says: 'capes, city rooftops and super powers', cur: 'Hero Stars',
    names: ['Hero HQ', 'Cape Squad', 'Super Squad'], worlds: ['Hero HQ', 'City Rooftops', 'Sky Patrol', 'Hall of Heroes'],
    words: ['superhero', 'superheroes', 'super hero', 'super heroes', 'hero', 'heroes', 'super powers', 'superpowers',
      'cape', 'capes', 'comic', 'comics', 'sidekick'],
  },
  {
    id: 'wizards', label: 'Wizard School', vibe: 'new', bg: '#170f2e', a: '#b388ff', a2: '#ffd54f', pat: 'stars', mascot: '🦉',
    says: 'spell books, starry hats and glowing potions', cur: 'Magic Beans',
    names: ['Wand Academy', 'Spell Castle', 'Starry Hats'], worlds: ['Potion Class', 'Moving Stairs', 'Library Tower', 'Great Hall'],
    words: ['wizard', 'wizards', 'witch', 'witches', 'magic', 'magical', 'spell', 'spells', 'potion', 'potions', 'wand',
      'wands', 'sorcerer', 'magic school', 'broomstick', 'owl', 'owls'],
  },
  {
    id: 'music', label: 'Music', vibe: 'new', bg: '#160b2e', a: '#ff4fd8', a2: '#3ef0ff', pat: 'zigzag', mascot: '🎸',
    says: 'big stages, bright lights and loud guitars', cur: 'Music Notes',
    names: ['Rock Stars', 'Encore', 'Headline Show'], worlds: ['Garage Band', 'Club Stage', 'Festival Field', 'Stadium Tour'],
    words: ['music', 'song', 'songs', 'band', 'bands', 'guitar', 'guitars', 'rock', 'rock star', 'pop', 'pop star', 'singing',
      'sing', 'singer', 'concert', 'dj', 'piano', 'drums', 'kpop', 'k pop', 'rap', 'karaoke', 'popstar', 'rockstar'],
  },
  {
    id: 'dance', label: 'Dance Party', vibe: 'candy', bg: '#2a0f2e', a: '#ff8a5c', a2: '#ffd166', pat: 'confetti', mascot: '🌈',
    says: 'disco lights, twirls and a big finale', cur: 'Dance Stars',
    names: ['Disco Fever', 'Twirl Town', 'Groove Squad'], worlds: ['Practice Room', 'Disco Hall', 'Big Stage', 'Grand Finale'],
    words: ['dance', 'dancing', 'dancer', 'ballet', 'disco', 'groove', 'hip hop', 'cheer', 'cheerleading', 'tap dance'],
  },
  {
    id: 'arcade', label: 'Retro Arcade', vibe: 'robots', bg: '#0b0b1e', a: '#ffe600', a2: '#ff3d7f', pat: 'checkers', mascot: '👾',
    says: 'pixel heroes, high scores and glowing screens', cur: 'Tokens',
    names: ['Pixel Arcade', 'High Score Hall', 'Level Up Land'], worlds: ['Coin Slot', 'Pixel Maze', 'Bonus Round', 'High Score'],
    words: ['arcade', 'retro', 'retro games', 'pixel', 'pixels', 'pixel art', '8 bit', 'eight bit', 'video game', 'video games',
      'gaming', 'gamer', 'console', 'joystick', 'high score', 'platformer'],
  },
  {
    id: 'creatures', label: 'Creature Collectors', vibe: 'jungle', bg: '#10213f', a: '#ffd23f', a2: '#ff5c5c', pat: 'leaves', mascot: '⚡',
    says: 'cute creatures, wild meadows and a full collection', cur: 'Berries',
    names: ['Critter Quest', 'Monster Meadow', 'Collect Them'], worlds: ['Starter Meadow', 'Mossy Woods', 'Crystal Cave', 'Champion Peak'],
    words: ['creature', 'creatures', 'critter', 'critters', 'pocket monsters', 'monster collecting', 'collecting', 'collector',
      'trainer', 'cute monsters'],
  },
  {
    id: 'candy', label: 'Candy Land', vibe: 'candy', bg: '#fff0f7', a: '#d6337f', a2: '#2a7fc9', pat: 'dots', mascot: '🍭',
    says: 'lollipops, gumdrops and sugar clouds', cur: 'Gumdrops',
    names: ['Sweet Land', 'Candy Craze', 'Sugar Quest'], worlds: ['Lollipop Lane', 'Choc Falls', 'Candy Castle', 'Sugar Peak'],
    words: ['candy', 'candies', 'sweets', 'sweet', 'sugar', 'lollipop', 'lollipops', 'chocolate', 'gummy', 'gummies',
      'jelly beans', 'marshmallow', 'marshmallows', 'ice cream', 'icecream', 'sundae', 'chocolate factory', 'bubblegum'],
  },
  {
    id: 'bakery', label: 'Bake Shop', vibe: 'candy', bg: '#fff1e6', a: '#c2185b', a2: '#8d5524', pat: 'hearts', mascot: '🧁',
    says: 'frosting swirls, sprinkles and warm ovens', cur: 'Sprinkles',
    names: ['Cupcake Corner', 'Sweet Oven', 'Bake Party'], worlds: ['Mixing Bowl', 'Cookie Counter', 'Cake Tower', 'Grand Bakery'],
    words: ['cake', 'cakes', 'cupcake', 'cupcakes', 'baking', 'bake', 'bakery', 'cookie', 'cookies', 'donut', 'donuts',
      'doughnut', 'doughnuts', 'dessert', 'desserts', 'pastry', 'muffin', 'muffins', 'pancakes', 'waffles'],
  },
  {
    id: 'robots', label: 'Robots', vibe: 'robots', bg: '#0d1117', a: '#39ff9f', a2: '#ff8a3d', pat: 'circuits', mascot: '🤖',
    says: 'whirring gears, blinking lights and robot pals', cur: 'Bolts',
    names: ['Robo Squad', 'Gear Up', 'Mega Bots'], worlds: ['Workshop', 'Gear Works', 'Mega Factory', 'Robot City'],
    words: ['robot', 'robots', 'robotics', 'droid', 'droids', 'android', 'androids', 'mech', 'mechs',
      'gears', 'gadgets', 'cyborg', 'bots', 'bot'],
  },
  {
    id: 'coding', label: 'Code Lab', vibe: 'robots', bg: '#0a1a2a', a: '#4ade80', a2: '#60a5fa', pat: 'circuits', mascot: '👾',
    says: 'glowing code, clever bugs to fix and big screens', cur: 'Bytes',
    names: ['Code Quest', 'Byte Club', 'Bug Busters'], worlds: ['Hello World', 'Loop Lagoon', 'Data Towers', 'The Cloud'],
    words: ['coding', 'code', 'coder', 'programming', 'programmer', 'computer', 'computers', 'tech', 'technology',
      'hacker', 'hacking', 'keyboard', 'internet', 'apps', 'website', 'binary'],
  },
  {
    id: 'jungle', label: 'Jungle', vibe: 'jungle', bg: '#0c2a17', a: '#7ee081', a2: '#ffd23f', pat: 'leaves', mascot: '🐒',
    says: 'swinging vines, monkeys and a lost temple', cur: 'Bananas',
    names: ['Jungle Run', 'Wild Trail', 'Vine Swing'], worlds: ['Jungle Floor', 'River Rapids', 'Lost Temple', 'Sky Canopy'],
    words: ['jungle', 'jungles', 'rainforest', 'rain forest', 'monkey', 'monkeys', 'vines', 'vine', 'tropical forest',
      'parrots', 'gorilla', 'gorillas', 'sloth', 'tiger', 'tigers'],
  },
  {
    id: 'safari', label: 'Safari', vibe: 'jungle', bg: '#2b1a07', a: '#f4a261', a2: '#e9c46a', pat: 'stripes', mascot: '🦁',
    says: 'golden grass, big sunsets and roaring lions', cur: 'Paw Prints',
    names: ['Safari Trail', 'Big Cat Trail', 'Wild Plains'], worlds: ['Base Camp', 'Watering Hole', 'Tall Grass', 'Sunset Ridge'],
    words: ['safari', 'lion', 'lions', 'savanna', 'savannah', 'zoo', 'zoos', 'elephant', 'elephants', 'giraffe', 'giraffes',
      'zebra', 'zebras', 'wild animals', 'wildlife', 'africa', 'hippo', 'rhino', 'cheetah'],
  },
  {
    id: 'pandas', label: 'Panda Grove', vibe: 'jungle', bg: '#0f2a1d', a: '#a3e635', a2: '#f9fafb', pat: 'leaves', mascot: '🐼',
    says: 'bamboo forests, misty hills and sleepy pandas', cur: 'Bamboo',
    names: ['Panda Grove', 'Bamboo Hills', 'Misty Peaks'], worlds: ['Bamboo Patch', 'Lantern Bridge', 'Misty Hills', 'Panda Peak'],
    words: ['panda', 'pandas', 'bamboo', 'red panda', 'koala', 'koalas', 'bear', 'bears', 'teddy', 'teddy bear'],
  },
  {
    id: 'frogs', label: 'Frog Pond', vibe: 'jungle', bg: '#0e2a22', a: '#5cdb95', a2: '#f7d046', pat: 'bubbles', mascot: '🐸',
    says: 'lily pads, croaks and a sparkly pond', cur: 'Lily Pads',
    names: ['Lily Pad Leap', 'Pond Hoppers', 'Ribbit Land'], worlds: ['Puddle Path', 'Lily Pond', 'Reed Marsh', 'Waterfall'],
    words: ['frog', 'frogs', 'toad', 'toads', 'pond', 'ponds', 'swamp', 'marsh', 'lily pad', 'lily pads', 'ribbit', 'tadpole'],
  },
  {
    id: 'winter', label: 'Winter Wonderland', vibe: 'new', bg: '#eef6ff', a: '#2563eb', a2: '#c0266d', pat: 'snow', mascot: '⛄',
    says: 'snowflakes, cosy hats and frosty hills', cur: 'Snowflakes',
    names: ['Snow Day', 'Frosty Peaks', 'Winter Glow'], worlds: ['Snowy Village', 'Frozen Lake', 'Ice Caves', 'North Peak'],
    words: ['winter', 'snow', 'snowy', 'snowman', 'snowmen', 'snowflake', 'snowflakes', 'ice', 'icy', 'frozen', 'frost',
      'christmas', 'ski', 'skiing', 'snowboard', 'snowboarding', 'sledging', 'sledding', 'north pole', 'ice skating', 'cold'],
  },
  {
    id: 'penguins', label: 'Polar Pals', vibe: 'ocean', bg: '#0a2540', a: '#9bd1ff', a2: '#ffb703', pat: 'snow', mascot: '🐧',
    says: 'icebergs, waddles and the northern lights', cur: 'Fish Snacks',
    names: ['Waddle Bay', 'Iceberg Island', 'Polar Pals'], worlds: ['Ice Floe', 'Penguin Colony', 'Igloo Town', 'Northern Lights'],
    words: ['penguin', 'penguins', 'polar', 'polar bear', 'polar bears', 'arctic', 'antarctica', 'iceberg', 'icebergs',
      'igloo', 'igloos', 'seal', 'seals', 'walrus', 'northern lights'],
  },
  {
    id: 'desert', label: 'Desert', vibe: 'new', bg: '#3b230f', a: '#ffb347', a2: '#4cc9f0', pat: 'zigzag', mascot: '🐪',
    says: 'golden dunes, pyramids and a cool oasis', cur: 'Sun Gems',
    names: ['Dune Runners', 'Pyramid Quest', 'Golden Sands'], worlds: ['Oasis Camp', 'Sand Dunes', 'Hidden Canyon', 'Great Pyramid'],
    words: ['desert', 'deserts', 'dunes', 'sand dunes', 'camel', 'camels', 'pyramid', 'pyramids', 'egypt', 'oasis',
      'cactus', 'cacti', 'canyon', 'canyons'],
  },
  {
    id: 'ranch', label: 'Horse Ranch', vibe: 'new', bg: '#2b1b12', a: '#f4a259', a2: '#8ecae6', pat: 'stripes', mascot: '🐴',
    says: 'galloping horses, hay bales and big open skies', cur: 'Horseshoes',
    names: ['Sunset Ranch', 'Gallop Valley', 'Saddle Up'], worlds: ['Stables', 'Paddock', 'Canyon Trail', 'Rodeo Ring'],
    words: ['horse', 'horses', 'horse riding', 'riding', 'pony riding', 'ranch', 'cowboy', 'cowboys', 'cowgirl', 'cowgirls',
      'wild west', 'rodeo', 'stables', 'saddle', 'gallop', 'western'],
  },
  {
    id: 'volcano', label: 'Volcano', vibe: 'new', bg: '#1f0a07', a: '#ff6b35', a2: '#ffd23f', pat: 'zigzag', mascot: '🌋',
    says: 'glowing lava, smoky peaks and hot rocks', cur: 'Lava Rocks',
    names: ['Lava Land', 'Magma Peaks', 'Hot Rock Rush'], worlds: ['Warm Springs', 'Ash Fields', 'Lava River', 'Volcano Top'],
    words: ['volcano', 'volcanoes', 'volcanos', 'lava', 'magma', 'eruption', 'fire', 'fiery', 'hot', 'flames', 'ember', 'embers'],
  },
  {
    id: 'art', label: 'Art Studio', vibe: 'new', bg: '#fffbe6', a: '#b45309', a2: '#0e7c5a', pat: 'confetti', mascot: '🎨',
    says: 'paint splats, crayons and a giant easel', cur: 'Paint Drops',
    names: ['Paint Party', 'Crayon Kingdom', 'Colour Splash'], worlds: ['Sketch Pad', 'Paint Studio', 'Gallery Hall', 'Masterpiece'],
    words: ['art', 'arts', 'drawing', 'draw', 'painting', 'paint', 'paints', 'colouring', 'coloring', 'arts and crafts',
      'creative', 'sketch', 'sketching', 'doodle', 'doodles', 'artist', 'crayons', 'anime', 'manga', 'cartoon', 'cartoons'],
  },
  {
    id: 'science', label: 'Science Lab', vibe: 'robots', bg: '#071c26', a: '#3ee0d0', a2: '#c6ff3d', pat: 'bubbles', mascot: '🧪',
    says: 'bubbling beakers, big ideas and bright sparks', cur: 'Atoms',
    names: ['Lab Legends', 'Big Ideas', 'Bright Sparks'], worlds: ['Lab Bench', 'Bubble Room', 'Star Lab', 'Invention Hall'],
    words: ['science', 'sciences', 'lab', 'laboratory', 'experiment', 'experiments', 'chemistry', 'scientist', 'scientists',
      'inventor', 'invention', 'inventions', 'stem', 'physics', 'biology', 'slime', 'microscope', 'atoms'],
  },
  {
    id: 'puppies', label: 'Puppy Park', vibe: 'candy', bg: '#fff7ed', a: '#c2410c', a2: '#2563eb', pat: 'hearts', mascot: '🐶',
    says: 'wagging tails, tennis balls and muddy paws', cur: 'Dog Treats',
    names: ['Puppy Park', 'Waggy Tails', 'Fetch Club'], worlds: ['Dog Bed', 'Back Garden', 'Puppy Park', 'Big Field'],
    words: ['puppy', 'puppies', 'dog', 'dogs', 'doggy', 'doggo', 'pup', 'pups', 'pet', 'pets', 'vet', 'animal', 'animals',
      'hamster', 'hamsters', 'bunny', 'bunnies', 'rabbit', 'rabbits', 'guinea pig'],
  },
  {
    id: 'kittens', label: 'Kitty Cafe', vibe: 'candy', bg: '#fdf2f8', a: '#be185d', a2: '#7c3aed', pat: 'hearts', mascot: '🐱',
    says: 'curly tails, yarn balls and cosy naps', cur: 'Yarn Balls',
    names: ['Kitty Cafe', 'Whisker World', 'Purr Palace'], worlds: ['Cosy Basket', 'Yarn Room', 'Rooftop Garden', 'Cat Castle'],
    words: ['kitten', 'kittens', 'cat', 'cats', 'kitty', 'kitties', 'meow', 'purr', 'cute', 'kawaii'],
  },
  {
    id: 'farm', label: 'Happy Farm', vibe: 'jungle', bg: '#fff8e1', a: '#2e7d32', a2: '#c62828', pat: 'stripes', mascot: '🐮',
    says: 'red barns, muddy boots and happy cows', cur: 'Golden Eggs',
    names: ['Sunny Farm', 'Barnyard Buddies', 'Harvest Hill'], worlds: ['Chicken Coop', 'Big Red Barn', 'Pumpkin Patch', 'Harvest Hill'],
    words: ['farm', 'farms', 'farmer', 'farming', 'cow', 'cows', 'tractor', 'tractors', 'barn', 'chicken', 'chickens',
      'pig', 'pigs', 'sheep', 'goat', 'goats', 'harvest', 'crops', 'village', 'countryside'],
  },
  {
    id: 'unicorns', label: 'Unicorns', vibe: 'candy', bg: '#2a0f2e', a: '#f472b6', a2: '#a5f3fc', pat: 'stars', mascot: '🦄',
    says: 'sparkles, rainbow manes and glittery skies', cur: 'Sparkles',
    names: ['Unicorn Dreams', 'Sparkle Sky', 'Glitter Gallop'], worlds: ['Sparkle Meadow', 'Glitter Falls', 'Moon Garden', 'Rainbow Castle'],
    words: ['unicorn', 'unicorns', 'sparkle', 'sparkles', 'sparkly', 'glitter', 'glittery', 'pony', 'ponies', 'pegasus',
      'princess pony'],
  },
  {
    id: 'fairies', label: 'Fairy Garden', vibe: 'candy', bg: '#f0fdf4', a: '#15803d', a2: '#be185d', pat: 'leaves', mascot: '🧚',
    says: 'tiny doors, toadstools and glowing wings', cur: 'Fairy Dust',
    names: ['Fairy Glen', 'Toadstool Town', 'Pixie Glade'], worlds: ['Tiny Door', 'Toadstool Ring', 'Moon Pond', 'Fairy Palace'],
    words: ['fairy', 'fairies', 'pixie', 'pixies', 'enchanted', 'fairy garden', 'elf', 'elves', 'toadstool', 'mushroom',
      'mushrooms', 'gnome', 'gnomes', 'woodland magic'],
  },
  {
    id: 'garden', label: 'Bug Garden', vibe: 'jungle', bg: '#fefce8', a: '#4d7c0f', a2: '#db2777', pat: 'leaves', mascot: '🐝',
    says: 'busy bees, butterflies and blooming flowers', cur: 'Honey Drops',
    names: ['Bloom Garden', 'Busy Bees', 'Butterfly Meadow'], worlds: ['Seed Patch', 'Flower Bed', 'Bee Hive', 'Butterfly House'],
    words: ['garden', 'gardens', 'gardening', 'flower', 'flowers', 'bee', 'bees', 'honey', 'butterfly', 'butterflies',
      'bug', 'bugs', 'insect', 'insects', 'ladybird', 'ladybug', 'caterpillar', 'plants', 'spring'],
  },
  {
    id: 'spooky', label: 'Spooky Fun', vibe: 'new', bg: '#1a0f2e', a: '#ff9f1c', a2: '#a3e635', pat: 'stars', mascot: '👻',
    says: 'friendly ghosts, glowing pumpkins and moonlit nights', cur: 'Candy Corn',
    names: ['Friendly Ghosts', 'Pumpkin Hollow', 'Moonlit Manor'], worlds: ['Pumpkin Patch', 'Creaky Gate', 'Moonlit Manor', 'Ghost Tower'],
    words: ['spooky', 'halloween', 'ghost', 'ghosts', 'haunted', 'haunted house', 'monster', 'monsters', 'pumpkin',
      'pumpkins', 'creepy', 'scary', 'horror', 'mummy', 'mummies', 'skeleton', 'skeletons', 'bats'],
  },
  {
    id: 'sky', label: 'Up in the Sky', vibe: 'new', bg: '#e8f4ff', a: '#2f80ed', a2: '#f2994a', pat: 'bubbles', mascot: '🌈',
    says: 'fluffy clouds, kites and wide blue sky', cur: 'Cloud Puffs',
    names: ['Cloud Hoppers', 'Sky High', 'Kite Kingdom'], worlds: ['Kite Hill', 'Cloud Town', 'Balloon Bay', 'Sky Castle'],
    words: ['sky', 'skies', 'cloud', 'clouds', 'cloudy', 'flying', 'fly', 'kite', 'kites', 'balloon', 'balloons',
      'hot air balloon', 'birds', 'bird', 'wind', 'aeroplane', 'aeroplanes', 'airplane', 'airplanes', 'plane', 'planes',
      'pilot', 'flight', 'helicopter'],
  },
  {
    id: 'rainbows', label: 'Rainbow Land', vibe: 'candy', bg: '#2a0f2e', a: '#ff8a5c', a2: '#ffd166', pat: 'confetti', mascot: '🌈',
    says: 'every colour at once and a pot of gold', cur: 'Rainbow Drops',
    names: ['Rainbow Trail', 'Colour Burst', 'Bright Side'], worlds: ['Red Hills', 'Orange Grove', 'Blue Lagoon', 'Pot of Gold'],
    words: ['rainbow', 'rainbows', 'colourful', 'colorful', 'colours', 'colors', 'bright', 'happy', 'pastel', 'neon colours'],
  },
  {
    id: 'forest', label: 'Forest Camp', vibe: 'jungle', bg: '#132a13', a: '#90be6d', a2: '#f9c74f', pat: 'leaves', mascot: '🦊',
    says: 'tall trees, campfires and starry nights', cur: 'Acorns',
    names: ['Forest Trail', 'Camp Firefly', 'Woodland Way'], worlds: ['Camp Site', 'Mossy Path', 'Waterfall', 'Mountain Lookout'],
    words: ['forest', 'forests', 'woods', 'woodland', 'camping', 'camp', 'campfire', 'tree', 'trees', 'treehouse', 'hiking',
      'outdoors', 'nature', 'fox', 'foxes', 'deer', 'squirrel', 'squirrels', 'wolf', 'wolves', 'scouts', 'mountain', 'mountains'],
  },
  {
    id: 'chef', label: 'Chef Kitchen', vibe: 'candy', bg: '#fff7ed', a: '#b91c1c', a2: '#15803d', pat: 'checkers', mascot: '🍕',
    says: 'sizzling pans, pizza nights and tasty treats', cur: 'Tasty Tokens',
    names: ['Head Chef Town', 'Pizza Palace', 'Kitchen Crew'], worlds: ['Snack Bar', 'Pizza Oven', 'Busy Kitchen', 'Grand Diner'],
    words: ['chef', 'chefs', 'cooking', 'cook', 'kitchen', 'food', 'foods', 'pizza', 'pizzas', 'burger', 'burgers', 'tacos',
      'pasta', 'restaurant', 'diner', 'snacks', 'fruit', 'sushi', 'noodles', 'fries'],
  },
  {
    id: 'explorers', label: 'Explorers', vibe: 'jungle', bg: '#1e1a0f', a: '#e9c46a', a2: '#2a9d8f', pat: 'zigzag', mascot: '🐢',
    says: 'old maps, hidden paths and lost wonders', cur: 'Map Pieces',
    names: ['Lost Wonders', 'Map Makers', 'Trail Blazers'], worlds: ['Base Camp', 'Hidden Path', 'Ancient Ruins', 'Lost City'],
    words: ['explore', 'exploring', 'explorer', 'explorers', 'adventure', 'adventures', 'adventurer', 'quest', 'quests',
      'expedition', 'map', 'maps', 'ruins', 'temple', 'archaeology', 'discovery', 'mission', 'missions', 'teamwork'],
  },
]

/** When nothing fits: the "Something new" starting point. */
export const NEW_TOPIC = {
  id: 'new', label: 'Something new', vibe: 'new', bg: '#2a0f2e', a: '#ff8a5c', a2: '#ffd166', pat: 'confetti', mascot: '🦄',
  says: '', cur: 'Sparks', names: ['My World', 'Dream Land', 'Big Adventure'], worlds: ['First Land', 'Second Land', 'Third Land', 'Final Land'],
  words: [],
}

export const TOPIC_MAP = Object.fromEntries([...TOPICS, NEW_TOPIC].map((t) => [t.id, t]))

/**
 * Games, sports leagues, brands, films and shows a child might type, each
 * mapped to a generic topic. The brand is only ever looked up here: it is
 * never in what comes out. A game for older players goes to a topic about
 * the place or the feeling, with nothing about what is done in the game.
 */
export const BRAND_ALIASES = {
  // Racing
  f1: 'racing', 'formula 1': 'racing', 'formula one': 'racing', nascar: 'racing', indycar: 'racing', ferrari: 'racing',
  mclaren: 'racing', 'red bull': 'racing', lamborghini: 'racing', 'mario kart': 'racing', 'need for speed': 'racing',
  forza: 'racing', 'gran turismo': 'racing', 'hot wheels': 'racing', 'lightning mcqueen': 'racing', 'crash team racing': 'racing',
  'rocket league': 'carsoccer',
  // Sports
  fifa: 'football', 'ea fc': 'football', 'ea sports fc': 'football', 'ea sports': 'football', 'premier league': 'football',
  'champions league': 'football', 'la liga': 'football', uefa: 'football', mls: 'football',
  nfl: 'gridiron', madden: 'gridiron', 'super bowl': 'gridiron',
  nba: 'basketball', wnba: 'basketball', 'nba 2k': 'basketball',
  mlb: 'baseball', wimbledon: 'tennis', 'tony hawk': 'skate', olympics: 'sports', 'wii sports': 'sports', wwe: 'sports',
  ufc: 'sports', nhl: 'sports',
  // Space and sci-fi
  nasa: 'space', spacex: 'space', 'star wars': 'space', 'star trek': 'space', kerbal: 'space', 'no mans sky': 'space',
  halo: 'space', destiny: 'space', 'among us': 'aliens',
  // Blocky worlds, islands and arcades
  minecraft: 'blocky', roblox: 'blocky', terraria: 'blocky', lego: 'blocky', legos: 'blocky',
  fortnite: 'partyisland', 'fall guys': 'partyisland', 'stumble guys': 'partyisland', pubg: 'partyisland', 'free fire': 'partyisland',
  'pac man': 'arcade', pacman: 'arcade', 'space invaders': 'arcade', tetris: 'arcade', mario: 'arcade', 'super mario': 'arcade',
  luigi: 'arcade', nintendo: 'arcade', 'donkey kong': 'arcade', sonic: 'arcade', 'smash bros': 'arcade', 'super smash bros': 'arcade',
  'street fighter': 'arcade', 'mortal kombat': 'arcade', tekken: 'arcade', xbox: 'arcade', playstation: 'arcade', ps5: 'arcade',
  ps4: 'arcade', 'geometry dash': 'arcade', 'subway surfers': 'arcade', kirby: 'arcade', splatoon: 'arcade', sega: 'arcade',
  // Creatures
  pokemon: 'creatures', pikachu: 'creatures', digimon: 'creatures', palworld: 'creatures', 'yokai watch': 'creatures',
  temtem: 'creatures', 'moshi monsters': 'creatures',
  // City Nights: the neon city, and nothing done in it
  gta: 'citynights', 'grand theft auto': 'citynights', gta5: 'citynights', gtav: 'citynights', gta6: 'citynights',
  cyberpunk: 'citynights', 'watch dogs': 'citynights', 'saints row': 'citynights', mafia: 'citynights', hitman: 'citynights',
  'sleeping dogs': 'citynights',
  // Missions and maps
  'call of duty': 'explorers', cod: 'explorers', battlefield: 'explorers', 'counter strike': 'explorers', csgo: 'explorers',
  'rainbow six': 'explorers', r6: 'explorers', uncharted: 'explorers', 'indiana jones': 'explorers', 'tomb raider': 'explorers',
  dora: 'explorers', zelda: 'explorers', 'legend of zelda': 'explorers', 'breath of the wild': 'explorers',
  // Heroes
  marvel: 'superheroes', avengers: 'superheroes', spiderman: 'superheroes', 'spider man': 'superheroes', batman: 'superheroes',
  superman: 'superheroes', dc: 'superheroes', 'dc comics': 'superheroes', 'justice league': 'superheroes',
  'my hero academia': 'superheroes', incredibles: 'superheroes', 'the incredibles': 'superheroes', 'x men': 'superheroes',
  overwatch: 'superheroes', valorant: 'superheroes', 'apex legends': 'superheroes', 'iron man': 'superheroes', hulk: 'superheroes',
  'wonder woman': 'superheroes', 'captain america': 'superheroes',
  // Ninjas, castles, dragons, wizards
  ninjago: 'ninjas', naruto: 'ninjas', 'assassins creed': 'ninjas', tmnt: 'ninjas', 'ninja turtles': 'ninjas',
  'teenage mutant ninja turtles': 'ninjas', 'kung fu panda': 'pandas',
  'elden ring': 'castles', 'dark souls': 'castles', shrek: 'castles', 'clash royale': 'castles', 'clash of clans': 'castles',
  'kingdom hearts': 'castles', disney: 'castles', 'disney princess': 'castles',
  skyrim: 'dragons', 'how to train your dragon': 'dragons', httyd: 'dragons', 'god of war': 'dragons', spyro: 'dragons',
  'dungeons and dragons': 'dragons', dnd: 'dragons',
  'harry potter': 'wizards', hogwarts: 'wizards', 'hogwarts legacy': 'wizards', 'fantastic beasts': 'wizards', wizard101: 'wizards',
  // Music and dance
  'guitar hero': 'music', 'rock band': 'music', 'beat saber': 'music', spotify: 'music', 'just dance': 'dance',
  // Places and animals
  'jurassic park': 'dinosaurs', 'jurassic world': 'dinosaurs', 'finding nemo': 'ocean', nemo: 'ocean', 'finding dory': 'ocean',
  moana: 'ocean', 'little mermaid': 'ocean', spongebob: 'ocean', subnautica: 'deepsea', 'baby shark': 'sharks',
  'sea of thieves': 'pirates', 'one piece': 'pirates', 'pirates of the caribbean': 'pirates',
  jumanji: 'jungle', tarzan: 'jungle', 'jungle book': 'jungle', 'lion king': 'safari', zootopia: 'safari', madagascar: 'safari',
  frogger: 'frogs', 'club penguin': 'penguins', 'happy feet': 'penguins', pingu: 'penguins', 'red dead': 'ranch',
  'red dead redemption': 'ranch', 'paw patrol': 'puppies', bluey: 'puppies', nintendogs: 'puppies', 'scooby doo': 'puppies',
  snoopy: 'puppies', 'hello kitty': 'kittens', sanrio: 'kittens', 'stardew valley': 'farm', stardew: 'farm', farmville: 'farm',
  'hay day': 'farm', 'peppa pig': 'farm', peppa: 'farm', 'animal crossing': 'garden', 'plants vs zombies': 'garden',
  'my little pony': 'unicorns', barbie: 'rainbows', 'care bears': 'rainbows', trolls: 'rainbows', 'tinker bell': 'fairies',
  winx: 'fairies', 'peter pan': 'fairies', 'angry birds': 'sky', 'top gun': 'sky', 'flight simulator': 'sky',
  overcooked: 'chef', 'cooking mama': 'chef', ratatouille: 'chef', mcdonalds: 'chef', 'candy crush': 'candy', 'willy wonka': 'candy',
  wonka: 'candy', 'bake off': 'bakery', transformers: 'robots', 'wall e': 'robots', walle: 'robots', 'big hero 6': 'robots',
  crayola: 'art', scratch: 'coding',
  // Not too spooky
  fnaf: 'spooky', 'five nights at freddys': 'spooky', 'poppy playtime': 'spooky', 'hello neighbor': 'spooky', granny: 'spooky',
  goosebumps: 'spooky', 'addams family': 'spooky', coraline: 'spooky', 'dead by daylight': 'spooky', 'resident evil': 'spooky',
  'the last of us': 'spooky', slenderman: 'spooky',
}

/** Little words that say nothing about a topic, left out of the closest match. */
const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'with', 'my', 'i', 'me', 'it', 'its', 'is',
  'like', 'love', 'want', 'theme', 'themes', 'world', 'worlds', 'game', 'games', 'style', 'kind', 'thing', 'things', 'stuff',
  'lot', 'lots', 'really', 'very', 'so', 'some', 'something', 'cool', 'awesome', 'fun', 'big', 'best', 'favourite', 'favorite',
  'new', 'one', 'that', 'this', 'for', 'about', 'but', 'from', 'be', 'all'])

/** A word's simple singular, so "dinosaurs" finds "dinosaur" and "beaches" finds "beach". */
const stem = (w) => (w.length > 4 && w.endsWith('es') && /(ch|sh|x|ss)es$/.test(w) ? w.slice(0, -2)
  : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)

const squash = (phrase) => phrase.split(' ').map(stem).join('')

/** Every phrase that leads to a topic, read run together: "rocket league" and "rocketleague" are the same. */
const PHRASES = (() => {
  const out = new Map()
  const add = (phrase, id) => { const key = squash(plainWords(phrase)); if (key && !out.has(key)) out.set(key, id) }
  for (const [alias, id] of Object.entries(BRAND_ALIASES)) add(alias, id)
  for (const t of TOPICS) { add(t.label, t.id); add(t.id, t.id); t.words.forEach((w) => add(w, t.id)) }
  return out
})()
const LONGEST = Math.max(...[...Object.keys(BRAND_ALIASES), ...TOPICS.flatMap((t) => t.words)].map((p) => plainWords(p).split(' ').length))

/** Each topic's own words, for the closest match. */
const TOPIC_WORDS = TOPICS.map((t) => ({ id: t.id, words: new Set([t.label, t.id, ...t.words].flatMap((p) => plainWords(p).split(' ')).map(stem)) }))

/**
 * The topic an idea leads to, and how: 'match' (a word or name the library
 * knows), 'close' (the most words in common, or a word that starts the
 * same way) or 'new' (nothing fits). Never looks anything up anywhere.
 */
export function findTopic(text) {
  const words = plainWords(text).split(' ').filter(Boolean)
  // The longest known phrase wins ("rocket league" over "rocket"), then the earliest.
  for (let n = Math.min(LONGEST, words.length); n >= 1; n -= 1) {
    for (let i = 0; i + n <= words.length; i += 1) {
      const id = PHRASES.get(words.slice(i, i + n).map(stem).join(''))
      if (id) return { topic: TOPIC_MAP[id], how: 'match' }
    }
  }
  const asked = words.filter((w) => !STOP.has(w) && w.length >= 3).map(stem)
  let best = null
  let bestScore = 0
  for (const { id, words: own } of TOPIC_WORDS) {
    let score = 0
    for (const w of asked) {
      if (own.has(w)) score += 2
      else if (w.length >= 5 && [...own].some((o) => o.length >= 5 && o.slice(0, 5) === w.slice(0, 5))) score += 1
    }
    if (score > bestScore) { best = id; bestScore = score }
  }
  return best ? { topic: TOPIC_MAP[best], how: 'close' } : { topic: NEW_TOPIC, how: 'new' }
}

/** The longest an idea may be typed. */
export const IDEA_MAX = 60

/** What a rude idea is told, the same gentle refusal as a rude name. */
export const IDEA_RUDE = 'That has a word RankUp does not allow. Try another idea.'

/** The line said for a topic: "Racing vibes: checkered flags, red and black, 🏎️". */
export const topicLine = (topic) => (topic.id === 'new' ? "Here's a starting point. Make it yours!" : `${topic.label} vibes: ${topic.says}, ${topic.mascot}`)

/** A topic as a design, in exactly the shape Theme Genesis stores (designFromVibe's). */
export function designFromTopic(topic) {
  const vibe = VIBE_MAP[topic.vibe] || VIBE_MAP.new
  return {
    name: topic.names[0],
    design: {
      v: 1, vibe: vibe.id, base: vibe.base, bg: topic.bg, a: topic.a, a2: topic.a2,
      pat: topic.pat, mascot: topic.mascot, cur: topic.cur, worlds: [...topic.worlds],
    },
  }
}

/**
 * "Make it": an idea in, a starting theme out. The rude-word filter runs on
 * the idea first. What was typed is used here and dropped: only the theme it
 * picks goes on.
 *
 *   { ok: true, topic, how, line, name, design }  or  { ok: false, problem }
 */
export function inspire(text) {
  const idea = String(text ?? '').slice(0, IDEA_MAX * 2)
  if (!plainWords(idea)) return { ok: false, problem: 'Type an idea first, like racing, space or dinosaurs.' }
  if (!wordsOk(idea)) return { ok: false, problem: IDEA_RUDE }
  const { topic, how } = findTopic(idea)
  const { name, design } = designFromTopic(topic)
  return { ok: true, topic, how, line: topicLine(topic), name: [...name].slice(0, NAME_MAX).join(''), design }
}
