/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Resource model; rape/crisis resources for victim/survivor support.              C.Veness 2017  */
/*                                                                                                */
/* All database modifications go through the model; most querying is in the handlers.             */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const ObjectId = require('mongodb').ObjectId;

/*
 * Rape crisis resources are provided as support information e.g. after incident report submission.
 */
const validator = { $and: [
    { name:     { $type: 'string', $exists: true } },
    { address:  { $type: 'string'                } },
    { phone:    { $type: 'array'                 } },
    { email:    { $type: 'array'                 } },
    { services: { $type: 'array'                 } },
    { category: { $type: 'string'                } },
    { location: { $type: 'object'                } }, // GeoJSON (with spatial index)
] };


class Resource {

    /**
     * Initialise new database; if not present, create 'resources' collection, add validation for it,
     * and add indexes. If everything is correctly set up, this is a no-op, so can be called freely
     * (for instance any time someone logs in).
     *
     * @param {string} db - Database to use.
     */
    static async init(db) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        // if no 'resources' collection, create it
        const collections = await global.db[db].collections();
        if (!collections.map(c => c.s.name).includes('resources')) {
            await global.db[db].createCollection('resources');
        }

        const resources = global.db[db].collection('resources');

        // TODO: if 'resources' collection doesn't have validation, add it
        //const infos = await resources.infos();
        //await global.db[db].command({ collMod: 'resources' , validator: validator }); TODO: sort out validation!

        // if 'resources' collection doesn't have correct indexes, add them
        const indexes = (await resources.indexes()).map(i => i.key);

        // geospatial index
        if (indexes.name_location == undefined) resources.createIndex({ location: '2dsphere',  name: 1 }, { name: 'name_location' });
    }

    /**
     * Expose find method for flexible querying.
     *
     * @param   {string}   db - Database to use.
     * @param   {*}        query - Query parameter to find().
     * @returns {Object[]} Resources details.
     */
    static async find(db, query) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        const resources = global.db[db].collection('resources');
        const rpts = await resources.find(query).toArray();
        return rpts;
    }


    /**
     * Returns Resource details (convenience wrapper for single Resource details).
     *
     * @param   {string}   db - Database to use.
     * @param   {ObjectId} id - Resource id or undefined if not found.
     * @returns {Object}   Resource details.
     */
    static async get(db, id) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        if (!(id instanceof ObjectId)) id = new ObjectId(id); // allow id as string

        const resources = global.db[db].collection('resources');

        const resource = await resources.findOne(id);

        return resource;
    }


    /**
     * Returns all Resources.
     *
     * @param   {string} db - Database to use.
     * @returns {Object[]} Resources details.
     */
    static async getAll(db) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        const resources = global.db[db].collection('resources');

        const cntrs = await resources.find({}).toArray();

        return cntrs;
    }


    /**
     * Returns Resources with given field matching given value.
     *
     * @param   {string}        db - Database to use.
     * @param   {string}        field - Field to be matched.
     * @param   {string!number} value - Value to match against field.
     * @returns {Object[]}      Resources details.
     */
    static async getBy(db, field, value) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        const resources = global.db[db].collection('resources');
        const cntrs = await resources.find({ [field]: value }).toArray();

        return cntrs;
    }


    /**
     * Returns Resources close to a given location. TODO: worth using this or just Resource.find?
     *
     * @param   {string}   db - Database to use.
     * @param   {number}   lat - Latitude to return results close to.
     * @param   {number}   lon - Longitude to return results close to.
     * @param   {number}   distance - Maximum distance (in metres) to return results for.
     * @returns {Object[]} Resources details.
     */
    static async getNear(db, lat, lon, distance) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        const resources = global.db[db].collection('resources');

        const point = { type: 'Point', coordinates: [ lon, lat ] };
        const query = { location: { $near: { $geometry: point, $maxDistance: distance } } };
        const cntrs = await resources.find(query).toArray();

        return cntrs;
    }


    /**
     * Creates new Resource record.
     *
     * @param   {string} db - Database to use.
     * @param   {Object} values - Resource details.
     * @param   {Object} geocode - Geocoding result.
     * @returns {number} New resource id.
     * @throws  Error on validation or referential integrity errors.
     */
    static async insert(db, values, geocode) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        const resources = global.db[db].collection('resources');

        if (geocode) { // record (geoJSON) location for (indexed) geospatial queries
            values.location = {
                type:        'Point',
                coordinates: [ Number(geocode.longitude), Number(geocode.latitude) ],
            };
        }

        const { insertedId } = await resources.insertOne(values);
        return insertedId;
    }


    /**
     * Update Resource details.
     *
     * @param  {string}   db - Database to use.
     * @param  {number}   id - Resource id.
     * @param  {ObjectId} values - Resource details.
     * @param  {Object}   geocode - Geocoding result.
     * @throws Error on referential integrity errors.
     */
    static async update(db, id, values, geocode) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        if (!(id instanceof ObjectId)) id = new ObjectId(id); // allow id as string

        const resources = global.db[db].collection('resources');

        if (geocode) { // record (geoJSON) location for (indexed) geospatial queries
            values.location = {
                type:        'Point',
                coordinates: [ Number(geocode.longitude), Number(geocode.latitude) ],
            };
        }

        await resources.updateOne({ _id: id }, { $set: values });
    }


    /**
     * Delete Resource record.
     *
     * TODO: never actually delete, just flag deleted, so that recorded referrals don't have dead links
     *
     * @param  {string}   db - Database to use.
     * @param  {ObjectId} id - Resource id.
     * @throws Error
     */
    static async delete(db, id) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        if (!(id instanceof ObjectId)) id = new ObjectId(id); // allow id as string

        const resources = global.db[db].collection('resources');
        await resources.deleteOne({ _id: id });
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = Resource;
