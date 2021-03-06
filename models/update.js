/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Update model - audit trail of updates made to reports.                     C.Veness 2017-2018  */
/*                                                                                                */
/*                                  © 2017-2018 Cambridge University / The Whistle | MIT licence  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import { ObjectId } from 'mongodb';    // MongoDB driver for Node.js
import dateFormat   from 'dateformat'; // Steven Levithan's dateFormat()
import Debug        from 'debug';      // small debugging utility

const debug = Debug('app:db'); // db write ops

import User   from './user.js';
import Report from './report.js';
import Db     from '../lib/db.js';


/*
 * An update record records all updates made to incident reports.
 */
/* eslint-disable key-spacing */
const schema = {
    type:       'object',
    required:   [ 'reportId', 'userId', 'update' ],
    properties: {
        _id:      { bsonType: 'objectId' },
        reportId: { bsonType: 'objectId' }, // report updated
        userId:   { bsonType: 'objectId' }, // user making update
        update:   { type:     'object' },   // update details as per update() update object
    },
    additionalProperties: false,
};
/* eslint-enable key-spacing */


class Update {

    /**
     * Initialises 'updates' collection; if not present, create it, add validation for it, and add
     * indexes.
     *
     * Currently this is invoked on any login, to ensure db is correctly initialised before it is
     * used. If this becomes expensive, it could be done less simplistically.
     *
     * @param {string} db - Database to use.
     */
    static async init(db) {
        const t1 = Date.now();

        // if no 'updates' collection, create it
        const collections = await Db.collections(db);
        if (!collections.map(c => c.s.name).includes('updates')) {
            await Db.createCollection(db, 'updates');
        }

        const updates = await Db.collection(db, 'updates');

        // in case 'updates' collection doesn't have validation (or validation is updated), add it
        await Db.command(db, { collMod: 'updates', validator: { $jsonSchema: schema } });

        // indexes
        updates.createIndex({ reportId: 1 });
        updates.createIndex({ userId: 1 });

        debug('Update.init', db, `${Date.now()-t1}ms`);
    }


    /**
     * Exposes find method for flexible querying.
     *
     * @param   {string} db - Database to use.
     * @param   {Object} query - Query parameter to find().
     * @returns {Object[]} Updates details.
     */
    static async find(db, query) {
        const updates = await Db.collection(db, 'updates');
        const update = await updates.find(query).toArray();
        return update;
    }


    /**
     * Returns Update details (convenience wrapper for single Update details).
     *
     * @param   {string}   db - Database to use.
     * @param   {ObjectId} id - Update id.
     * @returns {Object} Update details or null if not found.
     */
    static async get(db, id) {
        try {
            if (!(id instanceof ObjectId)) id = new ObjectId(id); // allow id as string
        } catch (e) {
            return null; // invalid id
        }

        const updates = await Db.collection(db, 'updates');
        const update = await updates.findOne(id);
        return update;
    }


    /**
     * Returns most recent Updates.
     *
     * @param   {string} db - Database to use.
     * @param   {number} limit - Limit on number of report details to be returned.
     * @returns {Object[]} Updates details.
     */
    static async getAll(db, limit=12) {
        const updates = await Db.collection(db, 'updates');

        const upd = await updates.find({}).sort([ [ '_id', -1 ] ]).limit(limit).toArray();

        const names = await User.names(); // note names is a Map

        // TODO: right place to be doing this?
        for (const u of upd) {
            u.on = u._id.getTimestamp();
            u.onFull = dateFormat(u.on, 'd mmm yyyy HH:MM');
            u.onDate = dateFormat(u.on, 'd mmm yyyy');
            u.onTime = dateFormat(u.on, 'HH:MM');
            u.by = names.get(u.userId.toString());
            u.report = await Report.get(db, u.reportId); // note if report gets deleted this will be null!
            u.description = Update.updateDescription(u.update, names);
        }

        return upd;
    }


    /**
     * Creates new Update record.
     *
     * @param   {ObjectId} reportId - Report being updated.
     * @param   {ObjectId} userId - User performing update.
     * @param   {Object}   update - The 'query' object supplied to updateOne() (but without '$'). TODO: include '$'?
     * @returns {ObjectId} New update id.
     * @throws  Error on validation or referential integrity errors.
     */
    static async insert(db, reportId, userId, update) {
        debug('Update.insert', 'db:'+db, 'r:'+reportId, 'u:'+userId);

        if (!(reportId instanceof ObjectId)) reportId = new ObjectId(reportId); // allow id as string
        if (!(userId instanceof ObjectId)) userId = new ObjectId(userId); // allow id as string

        const updates = await Db.collection(db, 'updates');

        const values = {
            reportId: reportId,
            userId:   userId,
            update:   update,
        };

        try {

            const { insertedId } = await updates.insertOne(values);
            return insertedId; // TODO: toString()? entire document?

        } catch (e) {
            if (e.code == 121) throw new Error(`Update ${db}/${reportId} failed validation [insert]`);
            throw e;
        }
    }


    /**
     * Deletes Update records relating to  given report (for test purposes).
     *
     * @param {string}   db - Database to use.
     * @param {ObjectId} reportId - Report update records are to be deleted for.
     */
    static async deleteForReport(db, reportId) {
        debug('Update.deleteForReport', 'db:'+db, 'r:'+reportId);

        const updates = await Db.collection(db, 'updates');
        if (!(reportId instanceof ObjectId)) reportId = new ObjectId(reportId); // allow id as string
        await updates.deleteMany({ reportId: reportId });
    }


    /**
     * Updates made to given report.
     *
     * @param   {string}   db - Database to use.
     * @param   {ObjectId} reportId - Report updates were made to.
     * @returns {Object[]} Updates details.
     */
    static async getByReport(db, reportId) {
        if (!(reportId instanceof ObjectId)) reportId = new ObjectId(reportId); // allow id as string

        const updates = await Db.collection(db, 'updates');
        const upd = await updates.find({ reportId: reportId }).toArray();

        const names = await User.names(); // note names is a Map

        // TODO: right place to be doing this?
        for (const u of upd) {
            u.by = names.get(u.userId.toString());
            u.on = u._id.getTimestamp();
            u.onFull = dateFormat(u.on, 'd mmm yyyy HH:MM');
            u.onDate = dateFormat(u.on, 'd mmm yyyy');
            u.onTime = dateFormat(u.on, 'HH:MM');
            u.description = Update.updateDescription(u.update, names);
        }

        return upd.sort((a, b) => a._id < b._id ? -1 : 1);
    }


    /**
     * Updates made by given user.
     *
     * @param   {string}   db - Database to use.
     * @param   {ObjectId} userId - User id.
     * @param   {number}   limit - Limit on number of report details to be returned.
     * @returns {Object[]} Updates details.
     */
    static async getByUser(db, userId, limit=12) {
        if (!(userId instanceof ObjectId)) userId = new ObjectId(userId); // allow id as string

        const updates = await Db.collection(db, 'updates');
        const upd = await updates.find({ userId: userId }).sort([ [ '_id', -1 ] ]).limit(limit).toArray();

        const names = await User.names(); // note names is a Map

        // TODO: right place to be doing this?
        for (const u of upd) {
            u.on = u._id.getTimestamp();
            u.onFull = dateFormat(u.on, 'd mmm yyyy HH:MM');
            u.report = await Report.get(db, u.reportId); // note if report gets deleted this will be null!
            u.description = Update.updateDescription(u.update, names);
        }

        return upd;
    }


    /**
     * Timestamp of most recent update made to given report.
     *
     * @param   {string}   db - Database to use.
     * @param   {ObjectId} reportId - Report id.
     * @returns { by, on , description } Update details (or {} if no updates made).
     */
    static async lastForReport(db, reportId) {
        if (!(reportId instanceof ObjectId)) reportId = new ObjectId(reportId); // allow id as string

        const updates = await Db.collection(db, 'updates');
        const [ update ] = await updates.find({ reportId: reportId }).sort({ _id: -1 }).limit(1).toArray();
        if (update == undefined) return {};

        const names = await User.names(); // note names is a Map

        update.by = names.get(update.userId.toString());
        update.on = update._id.getTimestamp();
        update.description = Update.updateDescription(update.update, names);

        return update;
    }


    /**
     * User-friendly version of description from stored update details (which follow MongoDB query format).
     *
     * @param   {Object} update - The stored update details.
     * @param   {Map}    names - Mapping of user names from ids.
     * @returns {string} User-friendly update description.
     * @private
     */
    static updateDescription(update, names) {
        let description = null;

        const op = Object.keys(update)[0];
        const fld = Object.keys(update[op])[0];
        const val = update[op][fld];
        switch (op) {
            case 'set':
                if (val == null) { description = `Set ${fld} to null`; break; } // eg wunderground fail
                switch (fld) {
                    case 'assignedTo':       description = `Set ${fld} to ${val?'@'+names.get(val.toString()):'<none>'}`; break;
                    case 'location':         description = `Set ${fld} to ‘${val.address}’`; break;
                    case 'analysis.weather': description = `Set ${fld} to ‘${val.city}, ${val.country}’`; break;
                    default:                 description = `Set ${fld} to ‘${val}’`; break;
                }
                break;
            case 'addToSet': description = `Add ${fld.slice(0, -1)} ‘${val}’`; break;
            case 'push':     description = `Add ${fld.slice(0, -1)} ‘${val}’`; break;
            case 'pull':     description = `Delete ${fld.slice(0, -1)} ‘${val}’`; break;
        }

        return description;
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default Update;
