/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Message model; SMS messages.                                               C.Veness 2017-2018  */
/*                                                                                                */
/* All database modifications go through the model; most querying is in the handlers.             */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import { ObjectId } from 'mongodb'; // MongoDB driver for Node.js

import Db from '../lib/db.js';


class Message {

    /**
     * Returns Message details (convenience wrapper for single Message details).
     *
     * @param   {ObjectId} id - Message id or undefined if not found.
     * @returns {Object}   Message details.
     */
    static async get(db, id) {
        const messages = await Db.collection(db, 'messages');
        if (!(id instanceof ObjectId)) id = new ObjectId(id); // allow id as string
        const message = await messages.findOne(id);
        return message;
    }


    /**
     * Returns all Messages.
     *
     * @returns {Object[]} Messages details.
     */
    static async getAll(db) {
        const messages = await Db.collection(db, 'messages');
        const msgs = await messages.find({}).toArray();
        return msgs;
    }


    /**
     * Returns Messages with given field matching given value.
     *
     * @param   {string}        field - Field to be matched.
     * @param   {string!number} value - Value to match against field.
     * @returns {Object[]}      Messages details.
     */
    static async getBy(db, field, value) {
        if (typeof field != 'string') throw new Error('Message.getBy: field must be a string');
        const messages = await Db.collection(db, 'messages');
        const msgs = await messages.find({ [field]: value }).toArray();
        return msgs;
    }


    /**
     * Creates new Message record.
     *
     * @param   {Object} values - Message details.
     * @returns {number} New message id.
     * @throws  Error on validation or referential integrity errors.
     */
    static async insert(db, values) {
        const messages = await Db.collection(db, 'messages');
        try {
            const { insertedId } = await messages.insertOne(values);
            return insertedId;
        } catch (e) {
            throw e;
        }
    }


    /**
     * Update Message details.
     *
     * @param  {number}   id - Message id.
     * @param  {ObjectId} values - Message details.
     * @throws Error on referential integrity errors.
     */
    static async update(db, id, values) {
        const messages = await Db.collection(db, 'messages');
        if (!(id instanceof ObjectId)) id = new ObjectId(id); // allow id as string
        await messages.updateOne({ _id: id }, { $set: values });
    }


    /**
     * Delete Message record.
     *
     * @param   {ObjectId} id - Message id.
     * @returns {boolean}  True if a record was deleted.
     */
    static async delete(db, id) {
        const messages = await Db.collection(db, 'messages');
        if (!(id instanceof ObjectId)) id = new ObjectId(id); // allow id as string
        const result = await messages.deleteOne({ _id: id });
        return result.deletedCount == 1;
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default Message;
