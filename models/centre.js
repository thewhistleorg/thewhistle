/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Centre model; rape/crisis centres for victim/survivor support.                                 */
/*                                                                                                */
/* All database modifications go through the model; most querying is in the handlers.             */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const ObjectId = require('mongodb').ObjectId;

/*
 * Rape crisis centres are provided as support information e.g. after incident report submission.
 */
const validator = { $and: [
    { name:        { $type: 'string', $exists: true } },
    { description: { $type: 'string', $exists: true } },
    { location:    { $type: 'object', $exists: true } }, // GeoJSON (with spatial index)
] };


class Centre {

    /**
     * Initialise new database; if not present, create 'centres' collection, add validation for it,
     * and add indexes. If everything is correctly set up, this is a no-op, so can be called freely
     * (for instance any time someone logs in).
     *
     * @param {string} db - Database to use.
     */
    static async init(db) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        // if no 'centres' collection, create it
        const collections = await global.db[db].collections();
        if (!collections.map(c => c.s.name).includes('centres')) {
            await global.db[db].createCollection('centres');
        }

        const centres = global.db[db].collection('centres');

        // TODO: if 'centres' collection doesn't have validation, add it
        //const infos = await centres.infos();
        //await global.db[db].command({ collMod: 'centres' , validator: validator }); TODO: sort out validation!

        // if 'centres' collection doesn't have correct indexes, add them
        const indexes = (await centres.indexes()).map(i => i.key);

        // geospatial index
        if (indexes.name_location == undefined) centres.createIndex({ location: '2dsphere',  name: 1}, { name: 'name_location' });
    }

    /**
     * Expose find method for flexible querying.
     *
     * @param   {string}   db - Database to use.
     * @param   {*}        query - Query parameter to find().
     * @returns {Object[]} Centres details.
     */
    static async find(db, query) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        const centres = global.db[db].collection('centres');
        const rpts = await centres.find(query).toArray();
        return rpts;
    }


    /**
     * Returns Centre details (convenience wrapper for single Centre details).
     *
     * @param   {string}   db - Database to use.
     * @param   {ObjectId} id - Centre id or undefined if not found.
     * @returns {Object}   Centre details.
     */
    static async get(db, id) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        if (!(id instanceof ObjectId)) id = new ObjectId(id); // allow id as string

        const centres = global.db[db].collection('centres');

        const centre = await centres.findOne(id);

        return centre;
    }


    /**
     * Returns all Centres.
     *
     * @param   {string} db - Database to use.
     * @returns {Object[]} Centres details.
     */
    static async getAll(db) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        const centres = global.db[db].collection('centres');

        const cntrs = await centres.find({}).toArray();

        return cntrs;
    }


    /**
     * Returns Centres with given field matching given value.
     *
     * @param   {string}        db - Database to use.
     * @param   {string}        field - Field to be matched.
     * @param   {string!number} value - Value to match against field.
     * @returns {Object[]}      Centres details.
     */
    static async getBy(db, field, value) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        const centres = global.db[db].collection('centres');
        const cntrs = await centres.find({ [field]: value }).toArray();

        return cntrs;
    }


    /**
     * Returns Centres close to a given location. TODO: worth using this or just Centre.find?
     *
     * @param   {string}   db - Database to use.
     * @param   {number}   lat - Latitude to return results close to.
     * @param   {number}   lon - Longitude to return results close to.
     * @param   {number}   distance - Maximum distance to return results for.
     * @returns {Object[]} Centres details.
     */
    static async getNear(db, lat, lon, distance) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        const centres = global.db[db].collection('centres');

        const point = { type: 'Point', coordinates: [ lon, lat] }
        const query = { location: { $near: { $geometry: point, $maxDistance: distance } } };
        const cntrs = await centres.find(query).toArray();

        return cntrs;
    }


    /**
     * Creates new Centre record.
     *
     * @param   {string} db - Database to use.
     * @param   {Object} values - Centre details.
     * @returns {number} New centre id.
     * @throws  Error on validation or referential integrity errors.
     */
    static async insert(db, values) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        const centres = global.db[db].collection('centres');

        // allow location to be supplied as lat,lon as convenience
        if (values.location == undefined) {
            values.location = { type: 'Point', coordinates: [ values.lon, values.lat ] };
            delete values.lat;
            delete values.lon;
        }

        // ensure coordinate is numeric
        values.location.coordinates[0] = Number(values.location.coordinates[0]);
        values.location.coordinates[1] = Number(values.location.coordinates[1]);

        const { insertedId } = await centres.insertOne(values);
        return insertedId;
    }


    /**
     * Update Centre details.
     *
     * @param  {string}   db - Database to use.
     * @param  {number}   id - Centre id.
     * @param  {ObjectId} values - Centre details.
     * @throws Error on referential integrity errors.
     */
    static async update(db, id, values) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        if (!(id instanceof ObjectId)) id = new ObjectId(id); // allow id as string

        const centres = global.db[db].collection('centres');

        // allow location to be supplied as lat,lon as convenience
        if (values.location == undefined) {
            values.location = { type: 'Point', coordinates: [ values.lon, values.lat ] };
            delete values.lat;
            delete values.lon;
        }

        // ensure coordinate is numeric
        values.location.coordinates[0] = Number(values.location.coordinates[0]);
        values.location.coordinates[1] = Number(values.location.coordinates[1]);

        await centres.updateOne({ _id: id }, { $set: values });
    }


    /**
     * Delete Centre record.
     *
     * @param  {string}   db - Database to use.
     * @param  {ObjectId} id - Centre id.
     * @throws Error
     */
    static async delete(db, id) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        if (!(id instanceof ObjectId)) id = new ObjectId(id); // allow id as string

        const centres = global.db[db].collection('centres');
        if (!(id instanceof ObjectId)) id = new ObjectId(id); // allow id as string
        await centres.deleteOne({ _id: id });
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = Centre;
