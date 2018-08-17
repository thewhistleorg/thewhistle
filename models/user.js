/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* User model; users allowed to access the system.                            C.Veness 2017-2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import { ObjectId } from 'mongodb'; // MongoDB driver for Node.js
import Debug        from 'debug';   // small debugging utility

const debug = Debug('app:db'); // db write ops

import Db from '../lib/db.js';


/*
 * A user record records all users authorised to log onto The Whistle admin dashboard.
 */
const schema = {
    type:       'object',
    required:   [ 'firstname', 'lastname', 'email', 'username', 'roles', 'databases' ],
    properties: {
        _id:                  { bsonType: 'objectId' },
        firstname:            { type: 'string' },                                   // first name
        lastname:             { type: 'string' },                                   // last name
        email:                { type: 'string' /* , format: 'email' */ },           // e-mail address used for logging in
        password:             { type: [ 'string', 'null' ] },                       // scrypt-encoded password
        username:             { type: 'string' /* , pattern: '[a-z0-9-_.]+' } */ }, // username for @mentions etc
        roles:                { type: 'array', items: { type: 'string', enum: [ 'reporter', 'user', 'admin', 'su' ] }  },
        databases:            { type: 'array', items: { type: 'string' }  },        // databases (organisations) user has access to
        passwordResetRequest: { type: [ 'string', 'null' ] },                       // token to validate password reset request
    },
    additionalProperties: false,
};


class User {

    /**
     * Initialises 'users' collection; if not present, create it, add validation for it, and add
     * indexes.
     *
     * Currently this is invoked on any login, to ensure db is correctly initialised before it is
     * used. If this becomes expensive, it could be done less simplistically.
     */
    static async init() {
        const t1 = Date.now();

        // if no 'users' collection, create it
        const collections = await Db.collections('users');
        if (!collections.map(c => c.s.name).includes('users')) {
            await Db.createCollection('users', 'users');
        }

        const users = await Db.collection('users', 'users');

        // in case 'users' collection doesn't have validation (or validation is updated), add it
        await Db.command('users', { collMod: 'users', validator: { $jsonSchema: schema } });

        // indexes
        users.createIndex({ firstname: 1, lastname: 1 });
        users.createIndex({ email: 1 }, { unique: true });
        users.createIndex({ username: 1 }, { unique: true });
        users.createIndex({ roles: 1 });
        users.createIndex({ databases: 1 });
        // TODO: can we do a compound unique index on username+databases? how would it operate?

        debug('User.init', `${Date.now()-t1}ms`);
    }


    /**
     * Returns User details (convenience wrapper for single User details).
     *
     * @param   {ObjectId} id - User id or undefined if not found.
     * @returns {Object} User details.
     */
    static async get(id) {
        const users = await Db.collection('users', 'users');
        if (!(id instanceof ObjectId)) id = new ObjectId(id); // allow id as string
        const user = await users.findOne(id);
        return user;
    }


    /**
     * Returns all Users.
     *
     * @returns {Object[]} Users details.
     */
    static async getAll() {
        const users = await Db.collection('users', 'users');
        const usrs = await users.find({}).toArray();
        return usrs;
    }


    /**
     * Returns Users with given field matching given value.
     *
     * Note this may involve a full collection scan, as not all fields are indexed. There are
     * unlikely to be enough users in the collection for this to be a problem.
     *
     * @param   {string}        field - Field to be matched.
     * @param   {string!number} value - Value to match against field.
     * @returns {Object[]} Users details.
     */
    static async getBy(field, value) {
        if (typeof field != 'string') throw new Error('User.getBy: field must be a string');
        const users = await Db.collection('users', 'users');
        const usrs = await users.find({ [field]: value }).toArray();
        return usrs;
    }


    /**
     * Returns Users who have access to given database.
     *
     * @param   {string} db - Database users have access to.
     * @returns {Object[]} Users details.
     */
    static async getForDb(db) {
        if (typeof db != 'string') throw new Error('User.getForDb: db must be a string');
        const users = await Db.collection('users', 'users');
        const usrs = await users.find({ databases: db }).toArray();
        return usrs;
    }


    /**
     * Creates new User record.
     *
     * @param   {Object} values - User details.
     * @returns {number} New user id.
     * @throws  Error on validation or referential integrity errors.
     */
    static async insert(values) {
        debug('User.insert', values.email);

        const users = await Db.collection('users', 'users');

        try {

            // note insertOne() adds an _id field to values, so pass a copy to leave the original clean
            const { insertedId } = await users.insertOne({ ...values });
            return insertedId;

        } catch (e) {
            if (e.code == 121) throw new Error('User failed validation');
            if (e.code == 11000) throw new Error(`email/username ‘${e.errmsg.split('"')[1]}’ already in use`);
            throw e;
        }
    }


    /**
     * Updates User details.
     *
     * @param  {number}   id - User id.
     * @param  {ObjectId} values - User details.
     * @throws Error on referential integrity errors.
     */
    static async update(id, values) {
        debug('User.update', 'u:'+id);

        const users = await Db.collection('users', 'users');
        if (!(id instanceof ObjectId)) id = new ObjectId(id); // allow id as string

        try {

            await users.updateOne({ _id: id }, { $set: values });

        } catch (e) {
            if (e.code == 121) throw new Error(`User ${id} failed validation`);
            if (e.code == 11000) throw new Error(`email/username ${e.errmsg.split('"')[1]} already in use`);
            throw e;
        }
    }


    /**
     * Deletes User record.
     *
     * @param   {ObjectId} id - User id.
     * @returns {boolean} True if a record was deleted.
     */
    static async delete(id) {
        debug('User.delete', 'u:'+id);

        const users = await Db.collection('users', 'users');
        if (!(id instanceof ObjectId)) id = new ObjectId(id); // allow id as string
        const result = await users.deleteOne({ _id: id });
        return result.deletedCount == 1;
    }


    /**
     * Gets list of user details indexed by id.
     *
     * @returns {Map} User details indexed by id.
     */
    static async details() {
        const users = await Db.collection('users', 'users');
        const usrs = await users.find({}).toArray();
        const map = new Map;
        usrs.forEach(u => map.set(u._id.toString(), u));
        return map;
    }


    /**
     * Gets list of user names indexed by id for e.g. use in translating id's to usernames.
     *
     * @returns {Map} User names indexed by id.
     */
    static async names() {
        const users = await Db.collection('users', 'users');
        const usrs = await users.find({}).toArray();
        const map = new Map;
        usrs.forEach(u => map.set(u._id.toString(), u.username));
        return map;
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default User;
