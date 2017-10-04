/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Error model - log system errors (those worth logging)                                          */
/*                                                                                                */
/* For now this just records errors. They will have to be inspected directly in the database, and */
/* also cleared out manually. In time we will have to devise some notification system.            */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';


class Error {

    /**
     * Creates new Error record.
     *
     * @param   {Object|string} error - The error to be logged.
     * @param   {string}        [source] - identifier of origin of error.
     * @param   {Object}        [ctx] - Koa context at time of error.
     * @returns {ObjectId} New error id.
     */
    static async insert(error, source=null, ctx=null) {
        // log errors in common users database rather than in organisation-specific databases
        const errors = global.db.users.collection('errors');

        if (typeof error != 'object') error = { error: error };

        error.date = new Date();
        if (source != null) error.source = source;
        if (ctx != null) error.ctx = ctx;

        const { insertedId } = await errors.insertOne(error);

        return insertedId;
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = Error;
