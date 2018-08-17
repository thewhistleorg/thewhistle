/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Submission tracking model; track how far through the submission process users get.             */
/*                                                                                 C.Veness 2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import useragent    from 'useragent'; // parse browser user agent string
import { ObjectId } from 'mongodb';   // MongoDB driver for Node.js
import Debug        from 'debug';     // small debugging utility

const debug = Debug('app:db'); // db write ops

import Db from '../lib/db.js';


/*
 * A submission record tracks how far through an incident report submission a users gets: in the
 * case of incomplete submissions, it shows at what point a user dropped out; in all cases, it
 * records the time pages were submitted, hence how long users spend on each page. It also records
 * the user agent used.
 */
const schema = {
    type:       'object',
    required:   [ 'project' ],
    properties: {
        _id:      { bsonType: 'objectId' },
        project:  { type: 'string' },       // project submission is for
        ua:       { type: 'object' },       // user agent
        progress: { type: 'object' },       // map where key is page number, value is date
        reportId: { bsonType: 'objectId' }, // report id if submission completed
    },
    additionalProperties: false,
};


class Submission {

    /**
     * Initialises 'submissions' collection; if not present, create it, add validation for it, and
     * add indexes.
     *
     * Currently this is invoked on any login, to ensure db is correctly initialised before it is
     * used. If this becomes expensive, it could be done less simplistically.
     *
     * @param {string} db - Database to use.
     */
    static async init(db) {
        const t1 = Date.now();

        // if no 'submissions' collection, create it
        const collections = await Db.collections(db);
        if (!collections.map(c => c.s.name).includes('submissions')) {
            await Db.createCollection(db, 'submissions');
        }

        const submissions = await Db.collection(db, 'submissions');

        // in case 'submissions' collection doesn't have validation (or validation is updated), add it
        await Db.command(db, { collMod: 'submissions', validator: { $jsonSchema: schema } });

        // indexes
        submissions.createIndex({ reportId: 1 });

        debug('Submission.init', db, `${Date.now()-t1}ms`);
    }


    /**
     * Returns submission record.
     *
     * @param   {string}   db - Database to use.
     * @param   {ObjectId} submissionId - Submission id.
     * @returns {Object} Submission details or null if not found.
     */
    static async get(db, submissionId) {
        if (!(submissionId instanceof ObjectId)) submissionId = new ObjectId(submissionId); // allow id as string
        if (!submissionId) return null;

        const submissions = await Db.collection(db, 'submissions');
        const submission = await submissions.findOne(submissionId);
        return submission;
    }


    /**
     * Returns all submission records.
     *
     * @param   {string} db - Database to use.
     * @returns {Object[]} Submission records.
     */
    static async getAll(db) {
        const submissions = await Db.collection(db, 'submissions');
        return await submissions.find({}).toArray();
    }


    /**
     * Records start of new incident report submission (e.g on GET of report home page).
     *
     * @param   {string} db - Database to use.
     * @param   {string} project - Project (campaign) report belongs to.
     * @param   {string} hdrUserAgent - User-Agent header.
     * @returns {ObjectId} Id of submission document.
     */
    static async insert(db, project, hdrUserAgent) {
        debug('Submission.insert', 'db:'+db, 'p:'+project);

        const submissions = await Db.collection(db, 'submissions');

        const ua = useragent.parse(hdrUserAgent);
        ua.agent = { os: ua.os, device: ua.device }; // os, device are only parsed on demand

        const values = { project: project, ua: ua };

        try {

            const { insertedId } = await submissions.insertOne(values);
            return insertedId;

        } catch (e) {
            if (e.code == 121) throw new Error('Submission failed validation [insert]');
            throw e;
        }
    }


    /**
     * Records progress in incident report submission (e.g. on POST). TODO: could this take (optional) reportId?
     *
     * @param {string}   db - Database to use.
     * @param {ObjectId} submissionId - Id of submission document.
     * @param {number}   page - Page being submitted ('0' for post of report home page).
     */
    static async progress(db, submissionId, page) {
        debug('Submission.progress', 'db:'+db, 's:'+submissionId, page);

        if (!(submissionId instanceof ObjectId)) submissionId = new ObjectId(submissionId); // allow id as string

        const submissions = await Db.collection(db, 'submissions');

        const values = { ['progress.'+page]: new Date() };

        try {

            await submissions.updateOne({ _id: submissionId }, { $set: values });

        } catch (e) {
            if (e.code == 121) throw new Error('Submission failed validation [progress]');
            throw e;
        }
    }


    /**
     * Records completion of incident report submission. This is invoked when the 'whatnext' page is
     * requested (being the only clear indication an incident report submission has been completed).
     *
     * @param {string}   db - Database to use.
     * @param {ObjectId} submissionId - Id of submission document.
     * @param {ObjectId} reportId - Id of submitted report document.
     */
    static async complete(db, submissionId, reportId) {
        debug('Submission.complete', 'db:'+db, 's:'+submissionId, 'r:'+reportId);

        if (!(submissionId instanceof ObjectId)) submissionId = new ObjectId(submissionId); // allow id as string
        if (!(reportId instanceof ObjectId)) reportId = new ObjectId(reportId);             // allow id as string

        const submissions = await Db.collection(db, 'submissions');

        const values = { 'progress.complete': new Date(), reportId: reportId };

        try {

            await submissions.updateOne({ _id: submissionId }, { $set: values });

        } catch (e) {
            if (e.code == 121) throw new Error('Submission failed validation [complete]');
            throw e;
        }
    }


    /**
     * Deletes progress record for given submission. This is purely for testing purposes, to avoid
     * the submissions collection growing unreasonably.
     *
     * @param {string}   db - Database to use.
     * @param {ObjectId} submissionId - Id of submission document to be deleted.
     */
    static async delete(db, submissionId) {
        debug('Submission.delete', 'db:'+db, 's:'+submissionId);

        if (!(submissionId instanceof ObjectId)) submissionId = new ObjectId(submissionId); // allow id as string

        const submissions = await Db.collection(db, 'submissions');

        await submissions.deleteOne({ _id: submissionId });
    }


    /**
     * Deletes progress record for given report.
     *
     * @param {string}   db - Database to use.
     * @param {ObjectId} reportId - Id of submitted report document.
     */
    static async deleteForReport(db, reportId) {
        debug('Submission.deleteForReport', 'db:'+db, 'r:'+reportId);

        if (!(reportId instanceof ObjectId)) reportId = new ObjectId(reportId); // allow id as string

        const submissions = await Db.collection(db, 'submissions');

        await submissions.deleteOne({ reportId: reportId });
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default Submission;
