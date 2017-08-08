/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Generate random adjective-animal combinations                                                 */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const adjectives = `
    abundant adorable adventurous agreeable alert alive amused attractive average beautiful better
    blushing boiling brainy brave breezy bright bumpy busy calm careful cautious charming cheerful
    chilly clean clear clever cloudy cold colourful comfortable cool courageous crazy crowded cuddly
    curious curly cute damp dark delightful determined different difficult doubtful drab dry dusty
    eager elated elegant enchanting encouraging energetic enthusiastic excited expensive exuberant
    fair faithful famous fancy fantastic few fine flaky fluffy fluttering fragile frail freezing
    fresh friendly funny fuzzy gentle gifted glamorous gleaming glorious good gorgeous graceful
    handsome happy healthy heavy helpful helpless hilarious homely hot icy important innocent
    inquisitive jolly joyous juicy kind light lively long loose lovely lucky magnificent misty
    modern motionless muddy mushy nice obedient odd outstanding perfect plain plastic pleasant
    poised poor powerful precious prickly proud puzzled quaint real relieved rich rough salty shaggy
    shaky sharp shiny shivering shy silky silly sleepy slippery smiling smooth soft solid sparkling
    splendid spotless steady sticky stormy strange strong successful super sweet talented tame
    tender thankful thirsty thoughtful tight tough uninterested unusual vast victorious vivacious
    wandering warm weak wet wild witty wonderful wooden yummy zany zealous
`.replace(/\n/g, ' ').split(/[ ]+/).filter(w => w != '');

const animals = `
    aardvark agouti albatross alpaca antelope armadillo avocet baboon, badger bandicoot barbet
    barracuda bat bear beaver bee bison blackbird blackbuck blesbok boar broket buffalo bulbul
    bunting butterfly camel capuchin caracara cardinal caribou cat caterpillar catfish chamois
    cheetah chiffchat chimpanzee chinchilla chipmunk chough chuckwalla civet clam coatimundi
    cockatoo cod colobus coot coqui cormorant cougar coyote crab crake crane crocodile crow curlew
    dabchick deer dinosaur dog dolphin donkey dotterel dove dragonfly duck dugong dunlin eagle
    echidna eel egret eland elephant elk emu falcon ferret finch flamingo flycatcher fox francolin
    frog galah gaur gazelle gecko gemsbok genet gerbil gerenuk giraffe gnat gnu goat godwit
    goldeneye goldfish goose gorilla goshawk grasshopper grison groundhog grouse guanaco guerza gull
    hamster hare hartebeest hawk hedgehog heron herring hippopotamus hoopoe hornbill horse
    hummingbird huron hyena hyrax ibex ibis iguana impala jacana jackal jaeger jaguar jaguarundi jay
    jellyfish kangaroo kingfisher kinkajou kiskadee kite klipspringer koala kongoni kookaburra
    kouprey kudu langur lapwing lark lechwe leegaan lemming lemur leopard lion llama lobster loris
    lory lourie lynx lyrebird macaque macaw magpie mallard manatee mara margay marmot marten meerkat
    mink mockingbird mongoose monitor monkey moorhen moose mouflon mouse mynah narwhal newt
    nighthawk nightingale nilgai numbat nutcracker nuthatch nyala ocelot octopus okapi onager
    opossum orca oribi oryx osprey ostrich otter owl ox oyster paca padamelon parakeet parrot
    partridge peacock peafowl pelican penguin phalarope pheasant pie pigeon platypus pony porcupine
    porpoise possum potoroo pronghorn puffin puku puma quail quelea quoll rabbit raccoon raven
    reedbuck reindeer rhea rhinoceros ringtail robin salamander salmon sambar sandgrouse sandpiper
    sardine seahorse seal serval sheep shelduck shrew shrimp siskin skink skua sparrow springbok
    springbuck springhare spurfowl squid squirrel starfish starling steenbock steenbuck stork
    sunbird sungazer suricate swallow swan tamandua tapir tayra tern tiger tinamou topi tortoise
    toucan trout tsessebe turaco turtle urial vicuna wagtail wallaby wallaroo walrus wambenger
    wapiti waterbuck weaver whale wolverine wombat woodchuck woodpecker woylie wren yak zebra zebra
    zorilla zorro
`.replace(/\n/g, ' ').split(/[ ]+/).filter(w => w != '');

/**
 * Generate random name comprising adjective-animal, using adjectives & animals from the curated
 * lists here.
 *
 * @param   {number} maxLength - Maximum length of name to be returned.
 * @returns {string} Random name comprising hyphenated adjective + animal.
 */
function adjectiveAnimal(maxLength=12) {
    let count = 0;
    do {
        const adjective = adjectives[Math.floor(Math.random()*adjectives.length)];
        const animal = animals[Math.floor(Math.random()*animals.length)];
        const name = adjective+'-'+animal;
        if (name.length <= maxLength) return name;

    } while (count++ < 1e6);
    throw new Error('iteration limit exceeded');
}

module.exports = adjectiveAnimal;
