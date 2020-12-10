/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* ReportSession model. Groups all reports submitted in one session.           Louis Slater 2018  */
/*                                                                                                */
/*                                       © 2018 Cambridge University / The Whistle | MIT licence  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


import Debug        from 'debug';   // small debugging utility

import { ObjectId } from 'mongodb'; // MongoDB driver for Node.js

const debug = Debug('app:db'); // db write ops


import Db           from '../lib/db.js';


const schema = {
    type:       'object',
    required:   [ 'reportIds' ],
    properties: {
        _id:       { bsonType: 'objectId' },
        reportIds: { type: 'array', items: { bsonType: 'objectId' }  }, //Reports associated with the session
    },
    additionalProperties: false,
};


class ReportSession {

    /**
     * Initialises 'ReportSession' collection; if not present, create it, add validation for it, and add
     * indexes.
     *
     * @param {string} db - Database to use.
     */
    static async init(db) {
        const t1 = Date.now();

        // if no 'report-sessions' collection, create it
        const collections = await Db.collections(db);
        if (!collections.map(c => c.s.name).includes('report-sessions')) {
            await Db.createCollection(db, 'report-sessions');
        }

        // in case 'groups' collection doesn't have validation (or validation is updated), add it
        await Db.command(db, { collMod: 'report-sessions', validator: { $jsonSchema: schema } });

        const reportSessions = await Db.collection(db, 'report-sessions');

        reportSessions.createIndex({ reportIds: 1 });

        debug('ReportSession.init', db, `${Date.now()-t1}ms`);
    }

    static async start(db) {
        debug('ReportSession.create', db);

        const reportSessions = await Db.collection(db, 'report-sessions');

        const values = {
            reportIds: [],
        };

        try {
            const { insertedId } = await reportSessions.insertOne(values);
            return insertedId;
        } catch (e) {
            if (e.code == 121) {
                throw new Error('ReportSession failed validation');
            } else {
                throw e;
            }
        }
    }


    /**
     * Returns the ReportSession corresponding to a given id.
     *
     * @param   {string}   db - Database to use.
     * @param   {ObjectId} id - Group id.
     *
     * @returns {Object}   ReportSession
     */
    static async get(db, id) {
        const reportSessions = await Db.collection(db, 'report-sessions');
        const reportSession = await reportSessions.findOne(id);
        return reportSession;
    }


    /**
     * Returns reports corresponding to a given ReportSession id.
     *
     * @param   {string}   db - Database to use.
     * @param   {string}   id - ReportSession id.
     *
     * @returns {ObjectId[]}   Report ids. Returns an empty array if report session isn't found.
     */
    static async getReports(db, id) {
        id = ReportSession.objectId(id);
        const reportSession = await ReportSession.get(db, id);
        return reportSession ? reportSession.reportIds : [];
    }

    /**
     * Adds a report to a ReportSession.
     *
     * @param {string}   db - Database to use.
     * @param {ObjectId} id - ReportSession id.
     * @param {string}   reportId - Report to be added.
     */
    static async addReport(db, id, reportId) {
        debug('ReportSession.addReport', 'db:' + db, 'ReportSession:' + id, 'report:' + reportId);
        id = ReportSession.objectId(id);
        reportId = ReportSession.objectId(reportId);
        try {
            const reportSessions = await Db.collection(db, 'report-sessions');
            await reportSessions.updateOne({ _id: id }, { $addToSet: { reportIds: reportId } });
        } catch (e) {
            if (e.code == 121) {
                throw new Error(`ReportSession ${db}/${id} failed validation`);
            } else {
                throw e;
            }
        }
    }

    static objectId(id) {
        return id instanceof ObjectId ? id : new ObjectId(id);
    }


}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default ReportSession;
