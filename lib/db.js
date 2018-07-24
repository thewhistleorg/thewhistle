/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Manage database connections.                                                    C.Veness 2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import { MongoClient } from 'mongodb'; // MongoDB driver for Node.js

global.db = {}; // initialise global.db to empty object on app startup


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
     * @param   {string} dbName - The name of the database to connect to.
     * @returns {Object} Database connection.
     * @throws Error on missing or invalid connection string.
     */
    static async connect(dbName) {
        const connectionString = process.env[`DB_${dbName.toUpperCase().replace('-', '_')}`];
        if (!connectionString) throw new Error(`No db configuration available for organisation ‘${dbName}’`);

        try {
            const client = await MongoClient.connect(connectionString, { useNewUrlParser: true });
            return client.db(client.s.options.dbName);
        } catch (e) {
            throw e; // TODO: any specific error handling?
        }
    }


    /**
     * Return list of (connected) databases.
     *
     * @returns {string[]} List of connected databases.
     */
    static databases() {
        return global.db;
    }


    /**
     * Return the specified collection from given database.
     *
     * @param   {string} dbName - Name of the database to use.
     * @param   {string} collectionName - Name of the collection.
     * @returns {Object} The MongoDB collection.
     */
    static async collection(dbName, collectionName) {
        if (!global.db[dbName]) global.db[dbName] = await Db.connect(dbName, { useNewUrlParser: true });

        const collection = global.db[dbName].collection(collectionName);
        if (!collection) throw new Error(`Collection ${dbName}/${collectionName} not found`);

        return collection;
    }


    /**
     * Return all collections in given database.
     *
     * @param   {string} dbName - Name of the database to use.
     * @returns {Object[]} Collections in database dbName.
     */
    static async collections(dbName) {
        if (!global.db[dbName]) global.db[dbName] = await Db.connect(dbName, { useNewUrlParser: true });

        return global.db[dbName].collections();
    }


    /**
     * Create a collection in database dbName.
     *
     * @param   {string} dbName - Name of the database to use.
     * @param   {string} collectionName - Name of collection to be created.
     */
    static async createCollection(dbName, collectionName) {
        await global.db[dbName].createCollection(collectionName);
    }
}

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default Db;
