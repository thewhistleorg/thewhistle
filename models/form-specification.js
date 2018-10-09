/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Form-specification model.                                                       C.Veness 2018  */
/*                                                                                                */
/* Form specifications can be stored in the file system (easier for forms developed by us), but   */
/* can also be stored in the database (easier for partners working on their own forms). This      */
/* model is just for form specs stored in the database.                                           */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import { ObjectId } from 'mongodb'; // MongoDB driver for Node.js
import Debug        from 'debug';   // small debugging utility

const debug = Debug('app:db'); // db write ops

import Db            from '../lib/db.js';
import FormGenerator from '../lib/form-generator';


/*
 * A form specification defines the questions that will be asked as part of a report submission.
 */
const schema = {
    type:       'object',
    required:   [ 'project', 'page', 'specification' ],
    properties: {
        _id:           { bsonType: 'objectId' },
        project:       { type: 'string' }, // project (aka campaign) form is reporting for
        page:          { type: 'string' }, // which page of a multi-page form (empty string for top-level page)
        specification: { type: 'string' }, // the JSON/YAML specification
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
     *
     * @param {string} db - Database to use.
     */
    static async init(db) {
        const t1 = Date.now();

        // if no 'form-specifications' collection, create it
        const collections = await Db.collections(db);
        if (!collections.map(c => c.s.name).includes('form-specifications')) {
            await Db.createCollection(db, 'form-specifications');
        }

        const formSpecifications = await Db.collection(db, 'form-specifications');

        // in case 'form-specifications' collection doesn't have validation (or validation is updated), add it
        await Db.command(db, { collMod: 'form-specifications', validator: { $jsonSchema: schema } });

        // indexes
        await formSpecifications.createIndex({ project: 1, page: 1 }, { unique: true });

        debug('FormSpecification.init', db, `${Date.now()-t1}ms`);
    }


    /**
     * Returns Form-specification details (convenience wrapper for single Form-specification details).
     *
     * @param   {string}   db - Database to use.
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
     * @param   {string} db - Database to use.
     * @returns {Object[]} Form-specifications details.
     */
    static async getAll(db) {
        const formSpecifications = await Db.collection(db, 'form-specifications');
        const specs = await formSpecifications.find({}).toArray();
        return specs;
    }


    /**
     * Returns Form-specification identified by project/page.
     *
     * @param   {string} db - Database to use.
     * @param   {string} project - Project (aka campaign).
     * @param   {string} page - Page number (or name).
     * @returns {Object} Form-specification details.
     */
    static async getSpec(db, project, page) {
        const formSpecifications = await Db.collection(db, 'form-specifications');
        const specs = await formSpecifications.find({ project, page }).toArray();
        return specs[0];
    }


    /**
     * Returns Form-specifications with given field matching given value.
     *
     * @param   {string}        db - Database to use.
     * @param   {string}        field - Field to be matched.
     * @param   {string|number} value - Value to match against field.
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
     * @param   {string} db - Database to use.
     * @param   {Object} values - Form-specification details.
     * @returns {number} New form-specification id.
     * @throws  SyntaxError on invalid JSON/YAML.
     * @throws  EvalError on form schema validation failure.
     * @throws  Error on database schema validation errors.
     */
    static async insert(db, values) {
        debug('FormSpecification.insert', db+'/'+values.project, 'p:'+values.page);

        const formSpecifications = await Db.collection(db, 'form-specifications');

        // values must be project, page, specification; db validation would catch this, but we need
        // it checked for the preValidate
        if (Object.keys(values).sort().join() != 'page,project,specification') {
            throw new Error('FormSpecification.update: values must be {project, page, specification}');
        }

        try {
            await FormGenerator.preValidate(db, values.project, values.page, values.specification);
        } catch (e) {
            // form specification add/edit pages use errpartialraw template to preserve message
            // formatting (this one includes newlines), so wrap error in html
            const html =  `<div class="error-msg">Error – <pre>${e.message}</pre></div>`;
            if (e.name == 'YAMLException') throw new SyntaxError(html);
            throw e;
        }

        try {

            // note insertOne() adds an _id field to values, so pass a copy to leave the original clean
            const { insertedId } = await formSpecifications.insertOne({ ...values });
            return insertedId;

        } catch (e) {
            if (e.code == 121) throw new Error('Form-specification failed database schema validation');
            throw e;
        }
    }


    /**
     * Updates Form-specification details.
     *
     * @param   {string}   db - Database to use.
     * @param   {number}   id - Form-specification id.
     * @param   {ObjectId} values - Form-specification details.
     * @throws  SyntaxError on invalid JSON/YAML.
     * @throws  EvalError on form schema validation failure.
     * @throws  Error on database schema validation errors.
     */
    static async update(db, id, values) {
        debug('FormSpecification.update', db, 'fs:'+id);

        const formSpecifications = await Db.collection(db, 'form-specifications');
        if (!(id instanceof ObjectId)) id = new ObjectId(id); // allow id as string

        // values must be project, page, specification; db validation would catch this, but we need
        // it checked for the preValidate
        if (Object.keys(values).sort().join() != 'page,project,specification') {
            throw new Error('FormSpecification.update: values must be {project, page, specification}');
        }

        try {
            await FormGenerator.preValidate(db, values.project, values.page, values.specification);
        } catch (e) {
            // form specification add/edit pages use errpartialraw template to preserve message formatting
            const html =  `<div class="error-msg">Error – <pre>${e.message}</pre></div>`;
            if (e.name == 'YAMLException') throw new SyntaxError(html);
            throw e;
        }

        try {

            await formSpecifications.updateOne({ _id: id }, { $set: values });

        } catch (e) {
            if (e.code == 121) throw new Error(`Form-specification ${id} failed database schema validation`);
            throw e;
        }
    }


    /**
     * Deletes Form-specification record.
     *
     * @param   {string}   db - Database to use.
     * @param   {ObjectId} id - Form-specification id.
     * @returns {boolean} True if a record was deleted.
     */
    static async delete(db, id) {
        debug('FormSpecification.delete', db, 'fs:'+id);

        const formSpecifications = await Db.collection(db, 'form-specifications');
        if (!(id instanceof ObjectId)) id = new ObjectId(id); // allow id as string
        const result = await formSpecifications.deleteOne({ _id: id });
        return result.deletedCount == 1;
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default FormSpecification;
