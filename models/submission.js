/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Submission tracking model; track how far through the submission process users get.             */
/*                                                                                 C.Veness 2018  */
/*                                                                                                */
/* All database modifications go through the model; most querying is in the handlers.             */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import useragent    from 'useragent'; // parse browser user agent string
import { ObjectId } from 'mongodb';   // MongoDB driver for Node.js
import Debug        from 'debug';     // small debugging utility

const debug = Debug('app:db'); // db write ops

import Db from '../lib/db.js';


/* eslint-disable no-unused-vars, key-spacing */
const schema = {
    type: 'object',
    required: [ 'project' ],
    properties: {
        project:  { type: 'string' },       // project submission is for
        ua:       { type: 'object' },       // user agent
        progress: { type: 'object' },       // map where key is page number, value is date
        reportId: { bsonType: 'objectId' }, // report id if submission completed
    },
};
/* eslint-enable no-unused-vars, key-spacing */
/* once we have MongoDB 3.6, we can use db.runCommand({ 'collMod': 'reports' , validator: { $jsonSchema: schema } }); */


class Submission {

    /**
     * Return submission record.
     *
     * @param   {string}   db - Database to use.
     * @param   {ObjectId} submissionId - Submission id.
     * @returns {Object}   Submission details or null if not found.
     */
    static async get(db, submissionId) {
        if (!(submissionId instanceof ObjectId)) submissionId = new ObjectId(submissionId); // allow id as string
        if (!submissionId) return null;

        const submissions = await Db.collection(db, 'submissions');
        const submission = await submissions.findOne(submissionId);
        return submission;
    }


    /**
     * Return all submission records.
     *
     * @param   {string} db - Database to use.
     * @returns {Object[]}   Submission records.
     */
    static async getAll(db) {
        const submissions = await Db.collection(db, 'submissions');
        return await submissions.find({}).toArray();
    }


    /**
     * Record start of new incident report submission (e.g on GET of report home page).
     *
     * @param {string} db - Database to use.
     * @param {string} project - Project (campaign) report belongs to.
     * @param {string} hdrUserAgent - User-Agent header.
     * @returns {ObjectId} Id of submission document.
     */
    static async insert(db, project, hdrUserAgent) {
        debug('Submission.insert', 'db:'+db, 'p:'+project);

        const submissions = await Db.collection(db, 'submissions');

        const ua = useragent.parse(hdrUserAgent);
        ua.agent = { os: ua.os, device: ua.device }; // os, device are only parsed on demand

        const values = { project: project, ua: ua };
        const { insertedId } = await submissions.insertOne(values);

        return insertedId;
    }


    /**
     * Record progress in incident report submission (e.g. on POST). TODO: could this take (optional) reportId?
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
        await submissions.updateOne({ _id: submissionId }, { $set: values });
    }


    /**
     * Record completion of incident report submission. This is invoked when the 'whatnext' page is
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
        await submissions.updateOne({ _id: submissionId }, { $set: values });
    }


    /**
     * Delete progress record for given submission. This is purely for testing purposes, to avoid
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
     * Delete progress record for given report.
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
