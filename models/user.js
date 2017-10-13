/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* User model; users allowed to access the system.                                 C.Veness 2017  */
/*                                                                                                */
/* All database modifications go through the model; most querying is in the handlers.             */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const ObjectId   = require('mongodb').ObjectId;

const validator = { $and: [ // TODO: validation for string or null
    { firstname: { $type: 'string', $exists: true } },
    { lastname:  { $type: 'string', $exists: true } },
    { email:     { $type: 'string', $exists: true } },
    { password:  { $type: 'string', $exists: true } },
    { username:  { $type: 'string', $exists: true } },
    { roles:     { $type: 'array',  $exists: true } },
    { databases: { $type: 'array',  $exists: true } },
] };

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
        const users = global.db.users.collection('users');
        const usrs = await users.find({ [field]: value }).toArray();
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

module.exports = User;
