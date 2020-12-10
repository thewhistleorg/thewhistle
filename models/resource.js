/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Resource model; rape/crisis resources for victim/survivor support.         C.Veness 2017-2018  */
/*                                                                                                */
/*                                  © 2017-2018 Cambridge University / The Whistle | MIT licence  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import { ObjectId } from 'mongodb'; // MongoDB driver for Node.js
import Debug        from 'debug';   // small debugging utility

const debug = Debug('app:db'); // db write ops

import Db from '../lib/db.js';


/*
 * Rape crisis resources are provided as support information e.g. after incident report submission.
 */
const schema = {
    type:       'object',
    required:   [ 'name' ],
    properties: {
        _id:      { bsonType: 'objectId' },
        name:     { type: 'string' },                                                     // name of organisation
        address:  { type: 'string' },                                                     // full address (geocodable)
        phone:    { type: 'array', items: { type: 'string' }  },                          // list of phone numbers
        email:    { type: 'array', items: { type: 'string' /* , format: 'email' */ }  },  // list of e-mail addresses
        website:  { type: 'string' /* , format': 'uri' */ },                              // web site ['format' not currently supported]
        services: { type: 'array', items: { type: 'string' }  },                          // list of services offered
        category: { type: 'string', enum: [ 'Legal aid', 'Medical help', 'Mental health counselling' ] },
        location: { type: 'object' },                                                     // GeoJSON (with spatial index)
    },
    additionalProperties: false,
};


class Resource {

    /**
     * Initialises 'resources' collection; if not present, create it, add validation for it, and add
     * indexes.
     *
     * Currently this is invoked on any login, to ensure db is correctly initialised before it is
     * used. If this becomes expensive, it could be done less simplistically.
     *
     * @param {string} db - Database to use.
     */
    static async init(db) {
        const t1 = Date.now();

        // if no 'resources' collection, create it
        const collections = await Db.collections(db);
        if (!collections.map(c => c.s.name).includes('resources')) {
            await Db.createCollection(db, 'resources');
        }

        const resources = await Db.collection(db, 'resources');

        // in case 'resources' collection doesn't have validation (or validation is updated), add it
        await Db.command(db, { collMod: 'resources', validator: { $jsonSchema: schema } });


        // if 'resources' collection doesn't have correct indexes, add them
        const indexes = (await resources.indexes()).map(i => i.key);

        // geospatial index
        if (indexes.name_location == undefined) resources.createIndex({ location: '2dsphere',  name: 1 }, { name: 'name_location' });

        // TODO: indexes (incl unique)

        debug('Resource.init', db, `${Date.now()-t1}ms`);
    }

    /**
     * Exposes find method for flexible querying.
     *
     * @param   {string}   db - Database to use.
     * @param   {*}        query - Query parameter to find().
     * @returns {Object[]} Resources details.
     */
    static async find(db, query) {
        const resources = await Db.collection(db, 'resources');
        const rpts = await resources.find(query).toArray();
        return rpts;
    }


    /**
     * Returns Resource details (convenience wrapper for single Resource details).
     *
     * @param   {string}   db - Database to use.
     * @param   {ObjectId} id - Resource id or undefined if not found.
     * @returns {Object} Resource details.
     */
    static async get(db, id) {
        if (!(id instanceof ObjectId)) id = new ObjectId(id); // allow id as string

        const resources = await Db.collection(db, 'resources');

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
        const resources = await Db.collection(db, 'resources');

        const cntrs = await resources.find({}).toArray();

        return cntrs;
    }


    /**
     * Returns Resources with given field matching given value.
     *
     * @param   {string}        db - Database to use.
     * @param   {string}        field - Field to be matched.
     * @param   {string!number} value - Value to match against field.
     * @returns {Object[]} Resources details.
     */
    static async getBy(db, field, value) {
        const resources = await Db.collection(db, 'resources');
        const cntrs = await resources.find({ [field]: value }).toArray();

        return cntrs;
    }


    /**
     * Returns Resources close to a given location. TODO: worth using this or just Resource.find?
     *
     * @param   {string} db - Database to use.
     * @param   {number} lat - Latitude to return results close to.
     * @param   {number} lon - Longitude to return results close to.
     * @param   {number} distance - Maximum distance (in metres) to return results for.
     * @returns {Object[]} Resources details.
     */
    static async getNear(db, lat, lon, distance) {
        const resources = await Db.collection(db, 'resources');

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
        debug('Resource.insert', 'db:'+db);

        const resources = await Db.collection(db, 'resources');

        if (geocode) { // record (geoJSON) location for (indexed) geospatial queries
            values.location = {
                type:        'Point',
                coordinates: [ Number(geocode.longitude), Number(geocode.latitude) ],
            };
        }

        try {

            const { insertedId } = await resources.insertOne(values);
            return insertedId;

        } catch (e) {
            if (e.code == 121) throw new Error('Resource failed validation [insert]');
            throw e;
        }
    }


    /**
     * Updates Resource details.
     *
     * @param  {string}   db - Database to use.
     * @param  {number}   id - Resource id.
     * @param  {ObjectId} values - Resource details.
     * @param  {Object}   geocode - Geocoding result.
     * @throws Error on referential integrity errors.
     */
    static async update(db, id, values, geocode) {
        debug('Resource.update', 'db:'+db, 'r:'+db);

        if (!(id instanceof ObjectId)) id = new ObjectId(id); // allow id as string

        const resources = await Db.collection(db, 'resources');

        if (geocode) { // record (geoJSON) location for (indexed) geospatial queries
            values.location = {
                type:        'Point',
                coordinates: [ Number(geocode.longitude), Number(geocode.latitude) ],
            };
        }

        try {

            await resources.updateOne({ _id: id }, { $set: values });

        } catch (e) {
            if (e.code == 121) throw new Error('Resource failed validation [update]');
            throw e;
        }
    }


    /**
     * Deletes Resource record.
     *
     * TODO: never actually delete, just flag deleted, so that recorded referrals don't have dead links
     *
     * @param  {string}   db - Database to use.
     * @param  {ObjectId} id - Resource id.
      */
    static async delete(db, id) {
        debug('Resource.delete', 'db:'+db, 'r:'+db);

        if (!(id instanceof ObjectId)) id = new ObjectId(id); // allow id as string

        const resources = await Db.collection(db, 'resources');
        await resources.deleteOne({ _id: id });
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default Resource;
