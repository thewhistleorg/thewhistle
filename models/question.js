/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Question model; parameterised copy for incident report submission questions, to enable         */
/* different 'myself/other' wordings for questions.                                C.Veness 2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import MongoDB from 'mongodb'; // MongoDB driver for Node.js
const ObjectId = MongoDB.ObjectId;

import Db from '../lib/db.js';


/* eslint-disable no-unused-vars, key-spacing */
const schema = {
    type: 'object',
    required: [ 'firstname', 'lastname', 'email', 'password', 'username', 'roles', 'databases' ],
    properties: {
        project:    { type: 'string' }, // project the question belongs to
        questionNo: { type: 'string' }, // question number (e.g. '3b')
        self:       { type: 'string' }, // copy for 'myself' version of question
        other:      { type: 'string' }, // copy for 'someone else' version of question
    },
};
/* eslint-enable no-unused-vars, key-spacing */
/* once we have MongoDB 3.6, we can use db.runCommand({ 'collMod': 'reports' , validator: { $jsonSchema: schema } }); */


class Question {

    /**
     * Initialise new collection; if not present, create 'questions' collection, add validation
     * for it, and add indexes. If everything is correctly set up, this is a no-op, so can be called
     * freely (for instance any time someone logs in).
     *
     * @param {string} db - Database to use.
     */
    static async init(db) {
        if (!global.db[db]) await Db.connect(db);

        // if no 'questions' collection, create it
        const collections = await global.db[db].collections();
        if (!collections.map(c => c.s.name).includes('questions')) {
            await global.db[db].createCollection('questions');
        }

        const questions = global.db[db].collection('questions');

        // TODO: if 'questions' collection doesn't have validation, add it

        // if 'questions' collection doesn't have correct indexes, add them
        const indexes = (await questions.indexes()).map(i => i.key);

        // project + question-no compound index (unique)
        if (indexes.project_question == undefined) {
            questions.createIndex({ project: 1,  questionNo: 1 }, { name: 'project_question', unique: true });
        }
    }


    /**
     * Returns questions for given project.
     *
     * @param {string} db - Database to use.
     * @param {string} project - Project questions are for.
     * @returns {Object[]} - Array of { questionNo, self, other } objects
     */
    static async get(db, project) {
        if (!global.db[db]) await Db.connect(db);

        const questions = global.db[db].collection('questions');

        const qns = await questions.find({ project: project }).toArray();

        return qns.sort((a, b) => a.questionNo < b.questionNo ? -1 : 1);
    }


    /**
     * Creates Question record.
     *
     * @param {string} db - Database to use.
     * @param {string} project - Project questions are for.
     * @param {string} questionNo - User details.
     * @param {string} self - Copy for 'myself' version of question.
     * @param {string} other - Copy for 'someone else' version of question.
     * @returns {ObjectId} New question id.
     */
    static async insert(db, project, questionNo, self, other) {
        if (!global.db[db]) await Db.connect(db);

        const questions = global.db[db].collection('questions');

        const values = { project, questionNo, self, other };

        const { insertedId } = await questions.insertOne(values);

        return insertedId;
    }


    /**
     * Updates Question record.
     *
     * @param {string} db - Database to use.
     * @param {ObjectId} id - id of question to be updated.
     * @param {string} questionNo - User details.
     * @param {string} self - Copy for 'myself' version of question.
     * @param {string} other - Copy for 'someone else' version of question.
     */
    static async update(db, id, questionNo, self, other) {
        if (!global.db[db]) await Db.connect(db);

        if (!(id instanceof ObjectId)) id = new ObjectId(id); // allow id as string

        const questions = global.db[db].collection('questions');

        const criteria = { _id: id };
        const values = { questionNo, self, other };

        await questions.updateOne(criteria, { $set: values });
    }


    /**
     * Deletes Question record.
     *
     * @param {string} db - Database to use.
     * @param {string} project - Project questions are for.
     * @param {string} questionNo - User details.
     * @param {string} self - Copy for 'myself' version of question.
     * @param {string} other - Copy for 'someone else' version of question.
     */
    static async delete(db, id) {
        if (!global.db[db]) await Db.connect(db);

        if (!(id instanceof ObjectId)) id = new ObjectId(id); // allow id as string

        const questions = global.db[db].collection('questions');

        await questions.deleteOne({ _id: id });
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default Question;
