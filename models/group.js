/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Group model. A group is essentially a sub-organisation. Has a many-to-many relation with both  */
/* users and reports. One organisation can have many groups, but a group can only have one        */
/* organisation.                                                               Louis Slater 2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


import Debug        from 'debug';   // small debugging utility

const debug = Debug('app:db'); // db write ops

import User         from '../models/user.js';
import Db           from '../lib/db.js';


/*
 * A user record records all users authorised to log onto The Whistle admin dashboard.
 */
const schema = {
    type:       'object',
    required:   [ 'reportIds' ],
    properties: {
        _id:       { bsonType: 'objectId' },
        name:      { type: 'string' }, //Group name
        reportIds: { type: 'array', items: { bsonType: 'objectId' }  }, //Reports associated with the group
    },
    additionalProperties: false,
};


class Group {

    /**
     * Initialises 'groups' collection; if not present, create it, add validation for it, and add
     * indexes.
     *
     * @param {string} db - Database to use.
     */
    static async init(db) {
        const t1 = Date.now();

        // if no 'groups' collection, create it
        const collections = await Db.collections(db);
        if (!collections.map(c => c.s.name).includes('groups')) {
            await Db.createCollection(db, 'groups');
        }

        // in case 'groups' collection doesn't have validation (or validation is updated), add it
        await Db.command(db, { collMod: 'groups', validator: { $jsonSchema: schema } });

        const groups = await Db.collection(db, 'groups');

        groups.createIndex({ reportIds: 1 });

        debug('Group.init', db, `${Date.now()-t1}ms`);
    }

    static async create(db, name) {
        debug('Group.create', db, name);

        const groups = await Db.collection(db, 'groups');

        const values = {
            name:      name,
            reportIds: [],
        };

        try {
            const { insertedId } = await groups.insertOne(values);
            return insertedId;
        } catch (e) {
            if (e.code == 121) {
                throw new Error(`Group ${name} failed validation`);
            } else {
                throw e;
            }
        }
    }

    /**
     * Returns the Group corresponding to a given id.
     *
     * @param   {string}   db - Database to use.
     * @param   {ObjectId} id - Group id.
     *
     * @returns {Object}   Group
     */
    static async get(db, id) {
        const groups = await Db.collection(db, 'groups');
        const group = await groups.findOne(id);
        return group;
    }


    /**
     * Returns all Groups on a given database.
     *
     * @param {ObjectId} db - Database to use.
     *
     * @returns {Object[]} Groups' details.
     */
    static async getAll(db) {
        const groups = await Db.collection(db, 'groups');
        const ret = await groups.find({}).toArray();
        return ret;
    }


    /**
     * Returns Group name corresponding to a given id.
     *
     * @param   {string}   db - Database to use.
     * @param   {ObjectId} id - Group id.
     *
     * @returns {string}   Group name or null if not found.
     */
    static async getName(db, id) {
        const group = await Group.get(db, id);
        return group ? group.name : null;
    }


    /**
     * Returns reports corresponding to a given Group id.
     *
     * @param   {string}   db - Database to use.
     * @param   {ObjectId} id - Group id.
     *
     * @returns {ObjectId[]}   Report ids. Returns an empty array if group isn't found.
     */
    static async getReports(db, id) {
        const group = await Group.get(db, id);
        return group ? group.reportIds : [];
    }


    /**
     * Deletes a given Group and any references to it.
     *
     * @param  {string}   db - Database to use.
     * @param  {ObjectId} id - Group id.
     *
     * @throws Error if MongoDB delete fails or remove directory fails.
     */
    static async delete(db, id) {
        debug('Group.delete', 'db:' + db, 'r:' + id);

        const group = await Group.get(db, id);
        if (!group) {
            const err = new Error('Group doesn\'t exist');
            err.status = 404;
            throw err;
        }

        await User.deleteForGroup(id);

        const groups = await Db.collection(db, 'groups');
        await groups.deleteOne({ _id: id });
    }


    /**
     * Adds a report to a group.
     *
     * @param {string}   db - Database to use.
     * @param {ObjectId} id - Group id.
     * @param {string}   reportId - Report to be added.
     */
    static async addReport(db, id, reportId) {
        debug('Group.addReport', 'db:' + db, 'group:' + id, 'report:' + reportId);

        try {
            const groups = await Db.collection(db, 'groups');
            await groups.updateOne({ _id: id }, { $addToSet: { reportIds: reportId } });
        } catch (e) {
            if (e.code == 121) {
                throw new Error(`Group ${db}/${id} failed validation`);
            } else {
                throw e;
            }
        }
    }


    /**
     * Removes a report from a group.
     *
     * @param {string}   db - Database to use.
     * @param {ObjectId} id - Group id.
     * @param {string}   reportId - Report to be removed.
     */
    static async removeReport(db, id, reportId) {
        debug('Group.removeReport', 'db:' + db, 'group:' + id, 'report:' + reportId);

        try {
            const groups = await Db.collection(db, 'groups');
            await groups.updateOne({ _id: id }, { $pull: { reportIds: reportId } });
        } catch (e) {
            if (e.code == 121) {
                throw new Error(`Group ${db}/${id} failed validation`);
            } else {
                throw e;
            }
        }
    }


    static async getReportGroups(db, reportId) {
        const groups = await Db.collection(db, 'groups');
        const ret = await groups.find({ reportIds: reportId }).toArray();
        return ret;
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default Group;
