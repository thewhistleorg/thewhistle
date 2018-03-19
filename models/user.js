/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* User model; users allowed to access the system.                            C.Veness 2017-2018  */
/*                                                                                                */
/* All database modifications go through the model; most querying is in the handlers.             */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import MongoDB from 'mongodb'; // MongoDB driver for Node.js
const ObjectId = MongoDB.ObjectId;

/* eslint-disable no-unused-vars, key-spacing */
const schema = {
    type: 'object',
    required: [ 'firstname', 'lastname', 'email', 'password', 'username', 'roles', 'databases' ],
    properties: {
        firstname: { type: 'string' },                            // first name
        lastname:  { type: 'string' },                            // last name
        email:     { type: 'string' },                            // e-mail address used for loggin in
        password:  { type: [ 'string', 'null' ] },                // scrypt-encoded password
        username:  { type: 'string' },                            // username for @mentions etc
        roles:     { type: 'array', items: { type: 'string', enum: [ 'reporter', 'user', 'admin', 'su' ] }  },
        databases: { type: 'array', items: { type: 'string' }  }, // databases (organisations) user has access to
    },
};
/* eslint-enable no-unused-vars, key-spacing */
/* once we have MongoDB 3.6, we can use db.runCommand({ 'collMod': 'reports' , validator: { $jsonSchema: schema } }); */

// note email and username should have unique indexes


class User {

    /**
     * Returns User details (convenience wrapper for single User details).
     *
     * @param   {ObjectId} id - User id or undefined if not found.
     * @returns {Object}   User details.
     */
    static async get(id) {
        const users = global.db.users.collection('users');
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
        const users = global.db.users.collection('users');
        const usrs = await users.find({}).toArray();
        return usrs;
    }


    /**
     * Returns Users with given field matching given value.
     *
     * @param   {string}        field - Field to be matched.
     * @param   {string!number} value - Value to match against field.
     * @returns {Object[]}      Users details.
     */
    static async getBy(field, value) {
        if (typeof field != 'string') throw new Error('User.getBy: field must be a string');
        const users = global.db.users.collection('users');
        const usrs = await users.find({ [field]: value }).toArray();
        return usrs;
    }


    /**
     * Returns Users who have access to given database.
     *
     * @param   {string}        database - Database users have access to.
     * @returns {Object[]}      Users details.
     */
    static async getForDb(db) {
        if (typeof db != 'string') throw new Error('User.getForDb: db must be a string');
        const users = global.db.users.collection('users');
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
        const users = global.db.users.collection('users');
        try {
            const { insertedId } = await users.insertOne(values);
            return insertedId;
        } catch (e) {
            if (e.message.slice(0, 26) == 'E11000 duplicate key error') {
                throw new Error('email/username already in use');
            } else {
                throw e;
            }
        }
    }


    /**
     * Update User details.
     *
     * @param  {number}   id - User id.
     * @param  {ObjectId} values - User details.
     * @throws Error on referential integrity errors.
     */
    static async update(id, values) {
        const users = global.db.users.collection('users');
        if (!(id instanceof ObjectId)) id = new ObjectId(id); // allow id as string
        await users.updateOne({ _id: id }, { $set: values });
    }


    /**
     * Delete User record.
     *
     * @param   {ObjectId} id - User id.
     * @returns {boolean}  True if a record was deleted.
     */
    static async delete(id) {
        const users = global.db.users.collection('users');
        if (!(id instanceof ObjectId)) id = new ObjectId(id); // allow id as string
        const result = await users.deleteOne({ _id: id });
        return result.deletedCount == 1;
    }


    /**
     * Get list of user details indexed by id.
     *
     * @returns {Map} User details indexed by id.
     */
    static async details() {
        const users = global.db.users.collection('users');
        const usrs = await users.find({}).toArray();
        const map = new Map;
        usrs.forEach(u => map.set(u._id.toString(), u));
        return map;
    }


    /**
     * Get list of user names indexed by id for e.g. use in translating id's to usernames.
     *
     * @returns {Map} User names indexed by id.
     */
    static async names() {
        const users = global.db.users.collection('users');
        const usrs = await users.find({}).toArray();
        const map = new Map;
        usrs.forEach(u => map.set(u._id.toString(), u.username));
        return map;
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default User;
