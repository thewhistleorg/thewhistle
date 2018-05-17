/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Establish database connection.                                                  C.Veness 2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import { MongoClient } from 'mongodb'; // MongoDB driver for Node.js


class Db {

    /**
     * Establish database connection to given db.
     *
     * The database connection string is expected to be found in an environment variable matching
     * the db name, upper-cased, with hyphen replace by underscore, prefixed by DB_; e.g. for db
     * 'test-cam', the env var holding the connection string will be DB_TEST_CAM.
     *
     * The connection is recorded in global.db[db].
     *
     * @param  {string} db - The name of the database to connect to.
     * @throws Error on missing or invalid connection string.
     */
    static async connect(db) {
        if (global.db[db]) return; // no-op if connection already available!

        const connectionString = process.env[`DB_${db.toUpperCase().replace('-', '_')}`];
        if (!connectionString) throw new Error(`No db configuration available for organisation ‘${db}’`);

        try {
            const client = await MongoClient.connect(connectionString);
            global.db[db] = client.db(client.s.options.dbName);
        } catch (e) {
            throw e; // TODO: any specific error handling?
        }
    }
}

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default Db;
