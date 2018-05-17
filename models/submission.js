/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* User model; users allowed to access the system.                                 C.Veness 2018  */
/*                                                                                                */
/* All database modifications go through the model; most querying is in the handlers.             */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import useragent    from 'useragent'; // parse browser user agent string
import { ObjectId } from 'mongodb';   // MongoDB driver for Node.js

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
     * Return all submission records.
     */
    static async getAll(db) {
        if (!global.db[db]) await Db.connect(db);

        const submissions = global.db[db].collection('submissions');
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
        if (!global.db[db]) await Db.connect(db);

        const submissions = global.db[db].collection('submissions');

        const ua = useragent.parse(hdrUserAgent);
        ua.agent = { os: ua.os, device: ua.device }; // os, device are only parsed on demand

        const values = { project: project, ua: ua };
        const { insertedId } = await submissions.insertOne(values);

        return insertedId;
    }


    /**
     * Record progress in incident report submission (e.g. on POST).
     *
     * @param {string} db - Database to use.
     * @param {ObjectId} submissionId - Id of submission document.
     * @param {number} page - Page being submitted ('0' for post of report home page).
     */
    static async progress(db, submissionId, page) {
        if (!global.db[db]) await Db.connect(db);

        if (!(submissionId instanceof ObjectId)) submissionId = new ObjectId(submissionId); // allow id as string

        const submissions = global.db[db].collection('submissions');

        const values = { ['progress.'+page]: new Date() };
        await submissions.updateOne({ _id: submissionId }, { $set: values });
    }


    /**
     * Record completion of incident report submission.
     *
     * @param {string} db - Database to use.
     * @param {ObjectId} submissionId - Id of submission document.
     * @param {ObjectId} reportId - Id of submitted report document.
     */
    static async complete(db, submissionId, reportId) {
        if (!global.db[db]) await Db.connect(db);

        if (!(submissionId instanceof ObjectId)) submissionId = new ObjectId(submissionId); // allow id as string
        if (!(reportId instanceof ObjectId)) reportId = new ObjectId(reportId);             // allow id as string

        const submissions = global.db[db].collection('submissions');

        const values = { 'progress.complete': new Date(),  reportId: reportId };
        await submissions.updateOne({ _id: submissionId }, { $set: values });
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default Submission;
