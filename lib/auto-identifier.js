/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Generate random identifier                                              (c) Chris Veness 2017  */
/*                                                                                                */
/* Random identifier is used to anonymously identify the submitter of an incident report with a   */
/* memorable identifier which is made up of a pair of nouns, the first (serving as an adjective   */
/* is a plant (including trees, fruit, herbs, etc) or a mineral, and the second is a landscape    */
/* feature - generating id's such as ‘alder mountain’, ‘sapling lagoon’, ‘cobalt reef’, etc       */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

// good source of vocabularies is www.enchantedlearning.com/wordlist

const trees = `
    almond apple apricot ash aspen baobob banyan bark beech birch bodhi buckeye butternut camellia
    cedar cherry chestnut cone cottonwood crabapple cypress date dogwood elderberry elm eucalyptus
    evergreen fig filbert fir forest ginkgo goldenlarch grapefruit gum hackberry hawthorn hickory
    holly jacktree jujuba juniper kumquat larch lilac linden loquat magnolia mahogany mangrove maple
    mimosa mountainash nectarine oak olive orange palm palmetto pawpaw peach pear pecan persimmon
    pine plum poplar quince redbud redwood rings sassafras sequoia spruce sycamore teak tupelo
    viburnum walnut willow wingnut yellowwood yew zebrawood`;

const fruit = `
    apple apricot avocado banana berry blackberry blueberry boysenberry breadfruit cantaloupe cherry
    coconut cranberry current date dragonfruit elderberry fig grape grapefruit guava honeydew
    jackfruit kiwi kumquat lemon lime lingonberry loquat lychee mango marionberry melon mulberry
    nectarine orange papaya peach pear persimmon pineapple plantain plum pomegranite pomelo prune
    quince raisin raspberry strawberry tangerine watermelon`;

const herbs = `
    allspice angelica anis bay basil bergamot borage burnet caraway cardamom cayenne celery chervil
    chicory chili chives cinnamon clove coriander cumin dill fennel fenugreek ginger lavender
    licorice lovage mace marjoram mustard nutmeg oregano paprika parsley pepper peppermint poppy
    rosemary rue saffron sage sesame sorrel spearmint tarragon thyme turmeric vanilla`;

const flowers = `
    anemone aster azalea begonia bluebell bluebonnet buttercup calendula camellia carnation chicory
    clover columbine cornflower crocus daffodil daisy dandelion dianthus dogwood edelweiss foxglove
    freesia gardenia gladiolus goldenrod hawthorn heather hibiscus hollyhock honeysuckle hydrangea
    iris jasmine jonquil larkspur laurel lavender lilac lily magnolia mallow marigold mayflower
    mimosa mistletoe myrtle narcissus nasturtium oleander orchid pansy passionflower peony
    poinsettia poppy primrose rose sunflower thistle tickseed trillium tulip vetch violet wallflower
    wisteria wolfsbane`;

const minerals = `
    agate amber amethyst aquamarine basalt calcite coral crystal diamond emerald fluorite garnet
    gold granite gravel gypsum jade jasper jet labradorite limestone magnetite malachite mica
    moonstone obsidian opal pyrite quartz ruby salt sand sandstone sapphire silica topaz turquoise
    vulcanite zircon`;

const landscape = `
    archipelago arroyo atoll bar basin bay bayou beach bight bluff bowl brook butte caldera canal
    canyon cape cascade cave cavern channel chasm chimney cirque cliff coast coastline col continent
    cove crag crater creek crest crevasse dale dell delta desert divide dome drift dune escarpment
    estuary falls firth fissure fjord foothills ford fork gap geyser glacier glade glen gorge grotto
    grove gulch gulf gully headland headwaters heath highland hill hillside hollow iceberg inlet
    island islet isthmus knoll lagoon lake lakebed landform ledge lowland mainland marsh mesa moor
    moraine mound mountain narrows oasis ocean overhang overlook pass peak peninsula plain plateau
    playa point pond prairie promontory range rapids ravine reef ridge rill rise river riverbed
    rivulet rock sandbar savanna scarp scree sea seabed seashore shallows shore shoreline slope
    sound source spring strait stream summit surf swamp tableland terrace terrain tributary tundra
    vale valley vent volcano waterfall watershed wetland wood`;

/**
 * Generate random two-word identifier, with first word a plant or mineral and second word a
 * landscape feature.
 *
 * @returns {string} Random identifier.
 */
function autoIdentifier() {

    // for first word concatenate plants, minerals; for second word use landscape features
    const list1 = [ trees, fruit, herbs, flowers, minerals ].join(' ');
    const list2 = landscape;

    // convert lists of words to arrays of strings
    const part1 = list1.replace(/\n/g, ' ').split(/[ ]+/).filter(w => w != '');
    const part2 = list2.replace(/\n/g, ' ').split(/[ ]+/).filter(w => w != '');

    // select random word from list1 & list 2
    const word1 = part1[Math.floor(Math.random()*part1.length)];
    const word2 = part2[Math.floor(Math.random()*part2.length)];

    return word1+' '+word2;
}

module.exports = autoIdentifier;
