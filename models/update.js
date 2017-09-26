/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Update model - audit trail of updates made to reports                                          */
/*                                                                                                */
/* All database modifications go through the model; most querying is in the handlers.             */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const dateFormat = require('dateformat'); // Steven Levithan's dateFormat()
const ObjectId   = require('mongodb').ObjectId;

const User   = require('./user.js');
const Report = require('./report.js');


/*
 * An update record records all updates made to incident reports.
 */
const validator = { $and: [
    { reportId: { $type: 'objectId', $exists: true } }, // report updated
    { userId:   { $type: 'objectId', $exists: true } }, // user making update
    { update:   { $type: 'object',   $exists: true } }, // update details as per update() update object
] };

class Update {

    /**
     * Expose find method for flexible querying.
     *
     * @param   {string}   db - Database to use.
     * @param   {*}        query - Query parameter to find().
     * @returns {Object[]} Updates details.
     */
    static async find(db, query) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        const updates = global.db[db].collection('updates');
        const update = await updates.find(query).toArray();
        return update;
    }


    /**
     * Returns Update details (convenience wrapper for single Update details).
     *
     * @param   {string}   db - Database to use.
     * @param   {ObjectId} id - Update id.
     * @returns {Object}   Update details or null if not found.
     */
    static async get(db, id) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        try {
            if (!(id instanceof ObjectId)) id = new ObjectId(id); // allow id as string
        } catch (e) {
            return null; // invalid id
        }

        const updates = global.db[db].collection('updates');
        const rpt = await updates.findOne(id);
        return rpt;
    }


    /**
     * Returns all Updates.
     *
     * @param   {string}   db - Database to use.
     * @param   {number}   limit - Limit on number of report details to be returned.
     * @returns {Object[]} Updates details.
     */
    static async getAll(db, limit=12) {
        const updates = global.db[db].collection('updates');

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
     * @param   {ObjectId} reportId - .
     * @param   {ObjectId} userId - .
     * @param   {Object}   update - .
     * @returns {ObjectId} New update id.
     * @throws  Error on validation or referential integrity errors.
     */
    static async insert(db, reportId, userId, update) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        if (!(reportId instanceof ObjectId)) reportId = new ObjectId(reportId); // allow id as string
        if (!(userId instanceof ObjectId)) userId = new ObjectId(userId); // allow id as string

        const updates = global.db[db].collection('updates');

        const values = {
            reportId: reportId,
            userId:   userId,
            update:   update,
        };

        const { insertedId } = await updates.insertOne(values);

        return insertedId; // TODO: toString()? entire document?
    }


    /**
     * Delete Update records relating to  given report (for test purposes).
     *
     * @param  {ObjectId} id - Update id.
     */
    static async deleteForReport(db, reportId) {
        const updates = global.db[db].collection('updates');
        if (!(reportId instanceof ObjectId)) reportId = new ObjectId(reportId); // allow id as string
        await updates.deleteMany({ reportId: reportId });
    }


    /**
     * Updates made to given report.
     *
     * @param   {string}   db - Database to use.
     * @param   {ObjectId} reportId - Report id.
     * @returns {Object[]} Updates details.
     */
    static async getByReport(db, reportId) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        if (!(reportId instanceof ObjectId)) reportId = new ObjectId(reportId); // allow id as string

        const updates = global.db[db].collection('updates');
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

        return upd;
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
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        if (!(userId instanceof ObjectId)) userId = new ObjectId(userId); // allow id as string

        const updates = global.db[db].collection('updates');
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
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        if (!(reportId instanceof ObjectId)) reportId = new ObjectId(reportId); // allow id as string

        const updates = global.db[db].collection('updates');
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
                switch (fld) {
                    case 'assignedTo': description = `Set ${fld} to ${val?'@'+names.get(val.toString()):'<none>'}`; break;
                    default:           description = `Set ${fld} to ‘${val}’`; break;
                }
                break;
            case 'addToSet': description = `Add ${fld.slice(0,-1)} ‘${val}’`; break;
            case 'push':     description = `Add ${fld.slice(0,-1)} ‘${val}’`; break;
            case 'pull':     description = `Delete ${fld.slice(0,-1)} ‘${val}’`; break;
        }

        return description;
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = Update;
