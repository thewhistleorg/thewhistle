/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Manage database connections.                                                    C.Veness 2018  */
/*                                                                                                */
/*                                       © 2018 Cambridge University / The Whistle | MIT licence  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import { MongoClient } from 'mongodb'; // MongoDB driver for Node.js
import Debug           from 'debug';   // small debugging utility

const debug = Debug('app:db'); // db write ops

const db = {}; // initialise db list to empty object on app startup


class Db {

    /**
     * Establish database connection to given dbName.
     *
     * The database connection string is expected to be found in an environment variable matching
     * the db name, upper-cased, with hyphen replace by underscore, prefixed by DB_; e.g. for db
     * 'grn-test', the env var holding the connection string will be DB_GRN_TEST.
     *
     * The connection is recorded in db[dbName].
     *
     * @param   {string} dbName - The name of the database to connect to.
     * @returns {Object} Database connection.
     * @throws Error on missing or invalid connection string.
     */
    static async connect(dbName) {
        const connectionString = process.env[`DB_${dbName.toUpperCase().replace(/-/g, '_')}`];
        if (!connectionString) throw new Error(`No db configuration available for organisation ‘${dbName}’`);

        if (db[dbName]) return db[dbName]; // already connected!

        try {
            debug('connect to ', dbName);
            const client = await MongoClient.connect(connectionString, { useNewUrlParser: true });
            db[dbName] = client.db(client.s.options.dbName);
            return db[dbName];
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
        return db;
    }


    /**
     * Return the specified collection from given database.
     *
     * @param   {string} dbName - Name of the database to use.
     * @param   {string} collectionName - Name of the collection.
     * @returns {Object} The MongoDB collection.
     */
    static async collection(dbName, collectionName) {
        if (!db[dbName]) db[dbName] = await Db.connect(dbName, { useNewUrlParser: true });

        const collection = db[dbName].collection(collectionName);
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
        if (!db[dbName]) db[dbName] = await Db.connect(dbName, { useNewUrlParser: true });

        return db[dbName].collections();
    }


    /**
     * Create a collection in database dbName.
     *
     * @param {string} dbName - Name of the database to use.
     * @param {string} collectionName - Name of collection to be created.
     */
    static async createCollection(dbName, collectionName) {
        await db[dbName].createCollection(collectionName);
    }


    /**
     * Execute database command.
     *
     * @param {string} dbName - Name of the database to use.
     * @param {Object} command - Command hash
     */
    static async command(dbName, command) {
        await db[dbName].command(command);
    }
}

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default Db;
