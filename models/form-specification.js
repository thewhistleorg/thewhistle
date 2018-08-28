/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Form-specification model.                                                       C.Veness 2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import { ObjectId } from 'mongodb'; // MongoDB driver for Node.js
import Debug        from 'debug';   // small debugging utility

const debug = Debug('app:db'); // db write ops

import Db from '../lib/db.js';


/*
 * TODO
 */
const schema = {
    type:       'object',
    required:   [ 'page', 'specification' ],
    properties: {
        project:       { type: 'string' }, //
        page:          { type: 'string' }, //
        specification: { type: 'string' }, //
    },
    additionalProperties: false,
};


class FormSpecification {

    /**
     * Initialises 'form-specifications' collection; if not present, create it, add validation for
     * it, and add indexes.
     *
     * Currently this is invoked on any login, to ensure db is correctly initialised before it is
     * used. If this becomes expensive, it could be done less simplistically.
     */
    static async init(db) {
        const t1 = Date.now();

        // if no 'form-specifications' collection, create it
        const collections = await Db.collections('form-specifications');
        if (!collections.map(c => c.s.name).includes('form-specifications')) {
            await Db.createCollection('form-specifications', 'form-specifications');
        }

        const formSpecifications = await Db.collection(db, 'form-specifications');

        // in case 'form-specifications' collection doesn't have validation (or validation is updated), add it
        await Db.command('form-specifications', { collMod: 'form-specifications', validator: { $jsonSchema: schema } });

        // indexes
        formSpecifications.createIndex({ page: 1 });

        debug('FormSpecification.init', `${Date.now()-t1}ms`);
    }


    /**
     * Returns Form-specification details (convenience wrapper for single Form-specification details).
     *
     * @param   {ObjectId} id - Form-specification id or undefined if not found.
     * @returns {Object} Form-specification details.
     */
    static async get(db, id) {
        const formSpecifications = await Db.collection(db, 'form-specifications');
        if (!(id instanceof ObjectId)) id = new ObjectId(id); // allow id as string
        const formSpecification = await formSpecifications.findOne(id);
        return formSpecification;
    }


    /**
     * Returns all Form-specifications.
     *
     * @returns {Object[]} Form-specifications details.
     */
    static async getAll(db) {
        const formSpecifications = await Db.collection(db, 'form-specifications');
        const specs = await formSpecifications.find({}).toArray();
        return specs;
    }


    /**
     * Returns Form-specifications with given field matching given value.
     *
     * @param   {string}        field - Field to be matched.
     * @param   {string!number} value - Value to match against field.
     * @returns {Object[]} Form-specification's details.
     */
    static async getBy(db, field, value) {
        if (typeof field != 'string') throw new Error('FormSpecification.getBy: field must be a string');
        const formSpecifications = await Db.collection(db, 'form-specifications');
        const specs = await formSpecifications.find({ [field]: value }).toArray();
        return specs;
    }


    /**
     * Creates new Form-specification record.
     *
     * @param   {Object} values - Form-specification details.
     * @returns {number} New form-specification id.
     * @throws  Error on validation or referential integrity errors.
     */
    static async insert(db, values) {
        debug('FormSpecification.insert', values.email);

        const formSpecifications = await Db.collection(db, 'form-specifications');

        // TODO: validation

        try {

            // note insertOne() adds an _id field to values, so pass a copy to leave the original clean
            const { insertedId } = await formSpecifications.insertOne({ ...values });
            return insertedId;

        } catch (e) {
            if (e.code == 121) throw new Error('Form-specification failed validation');
            throw e;
        }
    }


    /**
     * Updates Form-specification details.
     *
     * @param  {number}   id - Form-specification id.
     * @param  {ObjectId} values - Form-specification details.
     * @throws Error on referential integrity errors.
     */
    static async update(db, id, values) {
        debug('FormSpecification.update', 'u:'+id);

        const formSpecifications = await Db.collection(db, 'form-specifications');
        if (!(id instanceof ObjectId)) id = new ObjectId(id); // allow id as string

        // TODO: validation

        try {

            await formSpecifications.updateOne({ _id: id }, { $set: values });

        } catch (e) {
            if (e.code == 121) throw new Error(`Form-specification ${id} failed validation`);
            throw e;
        }
    }


    /**
     * Deletes Form-specification record.
     *
     * @param   {ObjectId} id - Form-specification id.
     * @returns {boolean} True if a record was deleted.
     */
    static async delete(db, id) {
        debug('FormSpecification.delete', 'u:'+id);

        const formSpecifications = await Db.collection(db, 'form-specifications');
        if (!(id instanceof ObjectId)) id = new ObjectId(id); // allow id as string
        const result = await formSpecifications.deleteOne({ _id: id });
        return result.deletedCount == 1;
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default FormSpecification;
