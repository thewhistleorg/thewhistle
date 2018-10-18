/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Report model.                                                              C.Veness 2017-2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import fs         from 'fs-extra';          // fs with extra functions & promise interface
import slugify            from 'slugify';           // make strings url-safe
import dateFormat         from 'dateformat';        // Steven Levithan's dateFormat()
import { exiftool }       from 'exiftool-vendored'; // cross-platform Node.js access to ExifTool
import useragent          from 'useragent';         // parse browser user agent string
import { ObjectId }       from 'mongodb';           // MongoDB driver for Node.js
import MUUID              from 'uuid-mongodb';      // generate/parse BSON UUIDs
import Debug              from 'debug';             // small debugging utility

const debug = Debug('app:db'); // db write ops

import User         from '../models/user.js';
import Notification from '../models/notification.js';
import Submission   from '../models/submission.js';
import AwsS3        from '../lib/aws-s3.js';
import Db           from '../lib/db.js';
import Update       from './update.js';


/*
 * A report holds the original submitted incident report, and various metadata.
 *
 * The submitted report may be any format, though will generally be an array of name-value pairs
 * from a web form (held as a standard JavaScript object).
 *
 * This schema is used for validation, specifying the metadata which the app expects to find as part
 * of the report. Of course, no operation should fail validation at this level: full validation
 * should be done both front-end and by the back-end app.
 *
 * When changes are made to the schema, they will be applied on next login, or by invoking /dev/init.
 */
/* eslint-disable key-spacing */
const schema = {
    type:       'object',
    required:   [ 'project', 'alias', 'submitted', 'location', 'analysis', 'assignedTo', 'status', 'tags', 'comments', 'archived', 'views' ],
    properties: {
        _id:            { bsonType: 'objectId' },
        project:        { type:     'string' },                // name of project report belongs to
        by:             { bsonType: [ 'objectId', 'null' ] },  // user entering incident report
        alias:          { type:     [ 'string', 'null' ] },    // auto-generated alias of victim/survivor
        submitted:      { type:     'object' },                // originally submitted report (flexible format following incident reporting format)
        submittedRaw:   { type:     'object' },                // originally submitted report - fields as per HTML input field names
        submittedTypes: { type:     'object' },                // types of submitted fields, for highlighting in reports
        submittedVersion: { type: 'object' }, // TODO: temporarily allow submittedVersion until existing reports cleaned
        files:          { type:     'array',                   // uploaded files
            items: { type: 'object' },                         // ... 'formidable' File objects
        },
        usedBefore:     { type:     'boolean' },               // whether user has used service before
        sessionId:      { bsonType: 'binData' },               // random UUID identifying session in which report was submitted
        ua:             { type:     [ 'object', 'null' ] },    // user agent of browser used to report incident
        country:        { type:     [ 'string', 'null' ] },    // country report was submitted from
        location:       { type:     'object',                  // geocoded incident location
            properties: {
                address: { type: 'string' },                   // ... entered address used for geocoding
                geocode: { type: [ 'object', 'null' ] },       // ... google geocoding data
                geojson: { type: [ 'object', 'null' ] },       // ... GeoJSON (with spatial index)
            },
        },
        analysis:       { type:     [ 'object', 'null' ],      // digital verification metadata
            properties: {
                files: { type:  'array',
                    items: { type: 'object',
                        properties: {
                            exif:    { type: [ 'object' ] },   // ... image exif data: lat/lon, create date
                        },
                    },
                },
                weather: { type: [ 'object' ] },               // ... wunderground weather info from report date/location
            },
        },
        assignedTo:     { bsonType: [ 'objectId', 'null' ] },  // user report is assigned to
        status:         { type:     [ 'string', 'null' ] },    // free-text status (to accomodate any workflow)
        tags:           { type:     'array',                   // tags to classify/group reports
            items: { type: 'string' },
        },
        comments:       { type:     'array',                   // notes/commentary documenting management of report
            items: { type: 'object',
                properties: {
                    byId:    { bsonType: 'objectId' },         // ... user making comment
                    byName:  { type:     'string' },           // ... username of user making comment (in case user gets deleted)
                    on:      { bsonType: 'date' },             // ... timestamp comment added
                    comment: { type:     'string' },           // ... comment in markdown format
                },
            },
        },
        views:            { type:     [ 'object', 'null' ] },    // associative array of timestamps indexed by user id
        archived:         { type:     'boolean' },               // archived flag
        lastUpdated:      { bsonType: 'date' },                  // date of when the user last made an edit to their submission
        evidenceToken:    { type:     'string' },                // unique token which is used in a URL for a user to upload evidence
        verificationCode: { type:     'string' },
        verified:         { type:     'boolean' },
    },
    additionalProperties: false,
};
/* eslint-enable key-spacing */


class Report {

    /**
     * Initialises 'reports' collection; if not present, create it, add validation for it, and add
     * indexes.
     *
     * Currently this is invoked on any login, to ensure db is correctly initialised before it is
     * used. If this becomes expensive, it could be done less simplistically (currently when there
     * are no schema changes, it takes below 100ms).
     *
     * @param {string} db - Database to use.
     */
    static async init(db) {
        const t1 = Date.now();

        // if no 'reports' collection, create it
        const collections = await Db.collections(db);
        if (!collections.map(c => c.s.name).includes('reports')) {
            await Db.createCollection(db, 'reports');
        }

        const reports = await Db.collection(db, 'reports');

        // in case 'reports' collection doesn't have validation (or validation is updated), add it
        await Db.command(db, { collMod: 'reports', validator: { $jsonSchema: schema } });

        // ---- indexes

        // indexes seem to be a bit strange in MongoDB: even determining if an index exists is not
        // straightforward; for now, just request index without testing if it already exists - this
        // seems to be fast, and is only done on explicit login

        //const indexes = (await reports.indexes()).map(i => i.key);
        //console.info('init/indexes', indexes)

        reports.createIndex({ project: 1 });
        reports.createIndex({ by: 1 });
        reports.createIndex({ alias: 1 });
        reports.createIndex({ 'location.geojson': '2dsphere' }); // geospatial index
        reports.createIndex({ assignedTo: 1 });
        reports.createIndex({ status: 1 });
        reports.createIndex({ tags: 1 });
        reports.createIndex({ archived: 1 });
        reports.createIndex({ evidenceToken: 1 });

        // free-text index for submitted information (ie fields in report.submitted)

        // there can only be a single free-text index on a collection; this can be either on all
        // fields in the collection, or on specified individual fields - the former is not what we
        // want, and the latter blows up, so for now, free-text searching uses $regex searches on
        // unindexed individual fields within the submitted sub-document

        // option a) - free-text search index on entire collection - not what we want!
        //reports.createIndex({ '$**': 'text' });

        // option b) - single free-text index on all submitted report fields simultaneously - no go,
        // MongoDB blows up with 'MongoError: Index key pattern too large'

        // get all submitted fields in all reports
        //const allRpts = await Report.getAll(db);
        //const flds = new Set;
        //for (const rpt of allRpts) {
        //    for (const fld of Object.keys(rpt.submitted)) flds.add(fld);
        //}
        //flds.delete('_id');
        //const fields = {};
        //for (const f of flds) fields['report.'+f] = 'text';
        //reports.createIndex(fields, { name: 'freetextfieldssearch' });

        debug('Report.init', db, `${Date.now()-t1}ms`);
    }


    /**
     * Exposes find method for flexible querying.
     *
     * @param   {string}   db - Database to use.
     * @param   {Object}   query - Query parameter to find().
     * @returns {Object[]} Reports details.
     */
    static async find(db, query) {
        const reports = await Db.collection(db, 'reports');
        const rpts = await reports.find(query).toArray();
        return rpts;
    }


    /**
     * Returns Report details (convenience wrapper for single Report details).
     *
     * @param   {string}   db - Database to use.
     * @param   {ObjectId} id - Report id.
     * @returns {Object}   Report details or null if not found.
     */
    static async get(db, id) {
        id = objectId(id); // allow id as string
        if (!id) return null;

        const reports = await Db.collection(db, 'reports');
        const rpt = await reports.findOne(id);
        return rpt;
    }


    /**
     * Returns all reports of given activity category.
     *
     * @param   {string}   db - Database to use.
     * @returns {Object[]} Reports details.
     */
    static async getAll(db, active='active') {
        const reports = await Db.collection(db, 'reports');
        const query = active=='active'
            ? { archived: false }
            : active=='archived' ? { archived: true } : {};
        const rpts = await reports.find(query).toArray();
        return rpts;
    }


    /**
     * Returns Reports with given field matching given value (convenience wrapper for simple filter).
     *
     * Note that values must be of the correct type: there is no automatic type conversion between
     * e.g. numbers and strings.
     *
     * TODO: what approach should be taken for origin report / metadata?
     *
     * @param   {string}               db - Database to use.
     * @param   {string}               field - Field to be matched.
     * @param   {string!number|RegExp} value - Value to match against field.
     * @returns {Object[]}             Reports details.
     */
    static async getBy(db, field, value) {
        const reports = await Db.collection(db, 'reports');
        const rpts = await reports.find({ [field]: value }).toArray();
        return rpts;
    }


    /**
     * Returns Reports with specified tag.
     *
     * TODO: what approach should be taken for origin report / metadata?
     *
     * @param   {string}   db - Database to use.
     * @param   {string}   tag - Tag to filter by.
     * @returns {Object[]} Reports details.
     */
    static async getByTag(db, tag) {
        const reports = await Db.collection(db, 'reports');
        const rpts = await reports.find({ ['tags']: tag }).toArray();
        return rpts;
    }


    /**
     * Returns timestamp of most recently submitted report.
     *
     * @param   {string}              db - Database to use.
     * @param   {active|archived|all} [active=active] - Timestamp of most recent report in given category.
     * @returns {string} Timestamp as ISO8601 string (or empty string if no reports of given category). TODO: return as Date?
     */
    static async getLatestTimestamp(db, active='all') {
        const reports = await Db.collection(db, 'reports');
        const query = active=='active'
            ? { archived: false }
            : active=='archived' ? { archived: true } : {};
        const [ lastReport ] = await reports.find(query).sort({ _id: -1 }).limit(1).toArray();
        if (!lastReport) return ''; // TODO: test
        const latestTimestamp = lastReport._id.getTimestamp().toISOString();

        return latestTimestamp;
    }


    /**
     * Returns timestamp of oldest report.
     *
     * @param   {string}              db - Database to use.
     * @param   {active|archived|all} [active=active] - Timestamp of oldest report in given category.
     * @returns {string} Timestamp as ISO8601 string (or empty string if no reports of given category). TODO: return as Date?
     */
    static async getOldestTimestamp(db, active='all') {
        const reports = await Db.collection(db, 'reports');
        const query = active=='active'
            ? { archived: false }
            : active=='archived' ? { archived: true } : {};
        const [ oldestReport ] = await reports.find(query).sort({ _id: 1 }).limit(1).toArray();
        if (!oldestReport) return ''; // TODO: test
        const oldestTimestamp = oldestReport._id.getTimestamp().toISOString();

        return oldestTimestamp;
    }


    static generateVerificationCode() {
        const pool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let ret = '';
        for (let i = 0; i < 6; i++) {
            ret += pool.charAt(Math.floor(Math.random() * pool.length));
        }
        return ret;
    }


    /**
     * Creates new skeleton Incident Report record.
     *
     * @param   {string}   db - Database to use.
     * @param   {string}   project - Project report is part of.
     * @param   {string}   alias - Alias to record for for submitter of report.
     * @param   {boolean}  usedBefore - Whether user has used service before.
     * @param   {UUID}     sessionId - UUID identifying session report is submitted as part of.
     * @param   {string}   userAgent - User agent from http request header.
     * @param   {string}   country - Country report was submitted from (obtained from IP address)
     * @returns {ObjectId} New report id.
     */
    static async submissionStart(db, project, alias, usedBefore, sessionId, userAgent, country) {
        debug('Report.submissionStart', 'db:'+db, 'p:'+project, alias);

        if (typeof alias != 'string' || alias.length == 0) throw new Error('Alias must be supplied');

        const reports = await Db.collection(db, 'reports');

        const values = {
            project:      project,
            submitted:    { Alias: alias },
            submittedRaw: {},
            alias:        alias,
            usedBefore:   usedBefore,
            sessionId:    typeof sessionId == 'string' ? MUUID.from(sessionId) : sessionId,
            ua:           null, // done below
            country:      country,
            location:     { address: '', geocode: null, geojson: null },
            analysis:     {},
            // summary:   null,
            assignedTo:   null,
            status:       null,
            tags:         [],
            comments:     [],
            views:        {},
            archived:     false,
        };

        // record user agent for potential later analyses
        const ua = useragent.parse(userAgent);
        values.ua = Object.assign({}, ua, { os: ua.os }); // trigger on-demand parsing of os

        if (db.startsWith('everyday-racism') && project === 'cambridge') {
            values.verificationCode = Report.generateVerificationCode();
            values.verified = false;
        }

        try {
            const { insertedId } = await reports.insertOne(values);
            return insertedId; // TODO: toString()?
        } catch (e) {
            if (e.code == 121) throw new Error(`Report submitted by ${alias} failed validation [submissionStart]`);
            throw e;
        }
    }


    /**
     * Sets (or updates) (prettified) report details.
     *
     * @param {string}   db - Database to use.
     * @param {ObjectId} id - Report Id.
     * @param {Object}   details - Report details to be added/updated, prettified for attractive display
     * @param {Object}   [detailsRaw] - Report details to be added/updated, as per HTML input elements
     */
    static async submissionDetails(db, id, details, detailsRaw={}) {
        debug('Report.submissionDetails', 'db:'+db, 'r:'+id, details);

        id = objectId(id);  // allow id as string

        const reports = await Db.collection(db, 'reports');

        try {

            // TODO: is there any way to do this as atomic updates rather than multiple calls?
            for (const field in details) {
                await reports.updateOne({ _id: id }, { $set: { [`submitted.${field}`]: details[field] } });
            }
            for (const field in detailsRaw) {
                await reports.updateOne({ _id: id }, { $set: { [`submittedRaw.${field}`]: detailsRaw[field] } });
            }

        } catch (e) {
            if (e.code == 121) throw new Error(`Report ${db}/${id} failed validation [submissionDetails]`);
            throw e;
        }
    }


    /**
     * Stores uploaded file.
     *
     * This uploads the file to AWS S3, records the file metadata, and records analysis such as EXIF
     * data.
     *
     * It takes the location of the uploaded file from the 'Formidable' file object; it deletes the
     * uploaded file from /tmp.
     *
     * @param {string}   db - Database to use.
     * @param {ObjectId} id - Report Id.
     * @param {Object}   formidableFile 'formidable' object from body.files: npmjs.com/package/formidable
     */
    static async submissionFile(db, id, formidableFile) {
        debug('Report.submissionFile', 'db:'+db, 'r:'+id, formidableFile.path, formidableFile.name);

        id = objectId(id); // allow id as string

        const reports = await Db.collection(db, 'reports');

        if (formidableFile.size == 0) return;

        const rpt = await Report.get(db, id);
        const project = rpt.project;

        // store uploaded files in AWS S3
        const src = formidableFile.path;                                       // path to uploaded file
        const date = dateFormat(id.getTimestamp(), 'yyyy-mm');                 // S3 sub-folder
        const name = slugify(formidableFile.name, { lower: true, remove: null }); // slugified filename

        // upload /tmp file to S3
        await AwsS3.put(db, project, date, id, name, src);

        // extract documented Formidable.File properties (we don't want to keep the other junk),
        // with patched values for path & name
        const file = {
            size:             formidableFile.size,
            path:             `${project}/${date}/${id}/`, // S3 folder
            name:             name,                        // slugified name
            type:             formidableFile.type,
            hash:             formidableFile.hash,
            lastModifiedDate: formidableFile.lastModifiedDate,
        };

        // extract EXIF metadata from files
        const exifData = await exiftool.read(src);
        const fileAnalysis = {
            exif: {
                name:         file.name,
                GPSLatitude:  exifData.GPSLatitude,
                GPSLongitude: exifData.GPSLongitude,
                CreateDate:   exifData.CreateDate, // as returned by exiftool-vendored: TZ usage TBD
            },
        };

        try {

            // store file details in the submitted report
            await reports.updateOne({ _id: id }, { $push: { files: file } });

            // store EXIF metadata in analysis
            await reports.updateOne({ _id: id }, { $push: { 'analysis.files': fileAnalysis } });

            // delete uploaded file from /tmp
            await fs.remove(src);

        } catch (e) {
            if (e.code == 121) throw new Error(`Report ${db}/${id} failed validation [submissionFile]`);
            throw e;
        }
    }


    /**
     * Creates new Report record.
     *
     * In addition to creating MongoDB record, this moves uploaded files from /tmp to ./static (and
     * patches the path in the 'formidable' objects), and fetches weather conditions for the given
     * location and date.
     *
     * @param   {string}   db - Database to use.
     * @param   {ObjectId} [by] - User recording incident report (undefined for public submission).
     * @param   {string}   alias - Generated alias used to refer to victim/survivor.
     * @param   {Object}   submitted - Report details (values depend on project).
     * @param   {string}   project - Project report is part of.
     * @param   {Object[]} files - Uploaded files ('formidable' File objects).
     * @param   {string}   userAgent - User agent from http request header.
     * @returns {ObjectId} New report id.
     * @throws  Error on validation or referential integrity errors.
     */
    // static async insert(db, by, alias, submitted, project, files, userAgent) {
    //     throw new Error('Report.insert: this function has been superceded by submissionStart / submissionDetails');
    //     debug('Report.insert', 'db:'+db, alias, submitted, 'p:'+project); // eslint-disable-line no-unreachable
    //
    //     by = objectId(by); // allow id as string
    //
    //     const reports = await Db.collection(db, 'reports');
    //
    //     // record report first, so that any file move issues don't cause us to lose it
    //
    //     const values = {
    //         project:    project,
    //         submitted:  submitted,
    //         by:         by,
    //         alias:      alias,
    //         location:   { address: '', geocode: null, geojson: null },
    //         analysis:   {},
    //         // summary: undefined,
    //         assignedTo: undefined,
    //         status:     undefined,
    //         tags:       [],
    //         comments:   [],
    //         views:      {},
    //         archived:   false,
    //     };
    //
    //     // record uploaded files within the submitted report object
    //     values.submitted.files = files || [];
    //
    //     // record user agent for potential later analyses
    //     const ua = useragent.parse(userAgent);
    //     values.ua = Object.assign({}, ua, { os: ua.os }); // trigger on-demand parsing of os
    //
    //     //values._id = ObjectId(Math.floor(Date.now()/1000 - Math.random()*60*60*24*365).toString(16)+(Math.random()*2**64).toString(16)); // random date in past year
    //     const { insertedId } = await reports.insertOne(values);
    //
    //     if (files) {
    //         // store uploaded files in AWS S3
    //         const date = dateFormat(insertedId.getTimestamp(), 'yyyy-mm');
    //         const fldr = `${project}/${date}/${insertedId}/`;
    //         for (const file of files) {
    //             if (file.size > 0) {
    //                 const src = file.path;
    //                 const dst = slugify(file.name, { lower: true, remove: null });
    //
    //                 // upload /tmp file to S3
    //                 await AwsS3.put(db, project, date, insertedId, dst, src);
    //
    //                 // replace submitted.files.name with slug & .path with S3 folder
    //                 const filter = { _id: insertedId, 'submitted.files.path': src };
    //                 const path = { 'submitted.files.$.name': dst, 'submitted.files.$.path': fldr };
    //                 await reports.updateOne(filter, { $set: path });
    //
    //                 // augment files object with EXIF metadata & save in analysis
    //
    //                 file.path = fldr; // S3 folder
    //                 file.name = dst;  // slugified name
    //
    //                 // extract EXIF metadata from files
    //                 const exif = await exiftool.read(src);
    //                 file.exif = {
    //                     GPSLatitude:  exif.GPSLatitude,
    //                     GPSLongitude: exif.GPSLongitude,
    //                     CreateDate:   exif.CreateDate, // TODO: JS Date object?
    //                 };
    //
    //                 await reports.updateOne({ _id: insertedId }, { $push: { 'analysis.files': file } });
    //
    //                 // delete uploaded file from /tmp
    //                 await fs.remove(src);
    //             }
    //         }
    //     }
    //
    //     return insertedId; // TODO: toString()? entire document?
    // }


    /**
     * Updates Report details.
     *
     * @param  {string}   db - Database to use.
     * @param  {ObjectId} id - Report id.
     * @param  {Object}   values - Report details.
     * @param  {ObjectId} [userId] - User id (for update audit trail).
     * @throws Error on validation or referential integrity errors.
     */
    static async update(db, id, values, userId=null) {
        debug('Report.update', 'db:'+db, 'r:'+id, values);

        id = objectId(id);         // allow id as string
        userId = objectId(userId); // allow id as string

        if (values.submitted != undefined) throw new Error('Cannot update submitted report');

        const reports = await Db.collection(db, 'reports');

        try {
            await reports.updateOne({ _id: id }, { $set: values });
        } catch (e) {
            if (e.code == 121) throw new Error(`Report ${db}/${id} failed validation [update]`);
            throw e;
        }

        if (userId) {
            await Update.insert(db, id, userId, { set: values }); // audit trail
        }
    }


    /**
     * Deletes entire Report. Normally only for testing purposes.
     *
     * @param  {string}   db - Database to use.
     * @param  {ObjectId} id - Report id.
     * @throws Error if MongoDB delete fails or remove directory fails.
     */
    static async delete(db, id) {
        debug('Report.delete', 'db:'+db, 'r:'+id);

        id = objectId(id); // allow id as string

        // retrieve report to determine project, in case there are persistent files to delete
        const report = await Report.get(db, id);
        if (!report) throw new Error(`Report ${id} not found`);

        // delete audit trail
        await Update.deleteForReport(db, id);

        // delete any notifications
        await Notification.cancelForReport(db, id);

        // delete submission progress tracking (note this will only delete progress for completed submissions - TODO!)
        await Submission.deleteForReport(db, id);

        // delete report
        const reports = await Db.collection(db, 'reports');
        await reports.deleteOne({ _id: id });

        // delete any uploaded files
        await AwsS3.deleteReportObjects(db, report.project, dateFormat(id.getTimestamp(), 'yyyy-mm'), id);
    }


    /**
     * Lists all statuses used
     *
     * TODO: restrict by eg agency, age?
     * TODO: better name?
     *
     * @param   {string}   db - Database to use.
     * @returns {string[]} Array of statuses currently in use (unsorted).
     */
    static async statuses(db) {
        // TODO: more efficient way to do this?
        const reports = await Report.getAll(db);

        const statuses = new Set();
        for (const report of reports) {
            statuses.add(report.status);
        }
        // undefined or null should be represented as empty string
        if (statuses.has(null)) {
            statuses.delete(null);
            statuses.add('');
        }
        if (statuses.has(undefined)) {
            statuses.delete(undefined);
            statuses.add('');
        }

        return [ ...statuses ].sort();
    }


    /**
     * Lists all tags used.
     *
     * TODO: restrict by eg assignedTo, status?
     * TODO: better name?
     *
     * @param   {string}   db - Database to use.
     * @returns {string[]} Array of tags currently in use.
     */
    static async tags(db) {
        // TODO: more efficient way to do this?
        const reports = await Report.getAll(db);

        const tags = new Set();
        for (const report of reports) {
            for (const tag of report.tags) tags.add(tag);
        }

        return [ ...tags ].sort();
    }


    /**
     * Adds tag to report. May be used as part of report submission, in which case userId will be null.
     *
     * @param {string}   db - Database to use.
     * @param {ObjectId} id - Report id.
     * @param {string}   tag - Tag to be added.
     * @param {ObjectId} userId - User id (for update audit trail).
     */
    static async insertTag(db, id, tag, userId) {
        debug('Report.insertTag', 'db:'+db, 'r:'+id, 't:'+tag, userId);

        id = objectId(id);         // allow id as string
        userId = objectId(userId); // allow userId as string

        try {

            const reports = await Db.collection(db, 'reports');
            await reports.updateOne({ _id: id }, { $addToSet: { tags: tag } });

        } catch (e) {
            if (e.code == 121) throw new Error(`Report ${db}/${id} failed validation [insertTag]`);
            throw e;
        }

        if (userId) await Update.insert(db, id, userId, { addToSet: { tags: tag } }); // audit trail
    }


    /**
     * Deletes tag from report. May be used as part of report submission, in which case userId will be null.
     *
     * @param {string}   db - Database to use.
     * @param {ObjectId} id - Report id.
     * @param {string}   tag - Tag to be deleted.
     * @param {ObjectId} userId - User id (for update audit trail).
     */
    static async deleteTag(db, id, tag, userId) {
        debug('Report.deleteTag', 'db:'+db, 'r:'+id, 't:'+tag, userId);

        id = objectId(id);         // allow id as string
        userId = objectId(userId); // allow id as string

        try {

            const reports = await Db.collection(db, 'reports');
            await reports.updateOne({ _id: id }, { $pull: { tags: tag } });

        } catch (e) {
            if (e.code == 121) throw new Error(`Report ${db}/${id} failed validation [deleteTag]`);
            throw e;
        }

        if (userId) await Update.insert(db, id, userId, { pull: { tags: tag } }); // audit trail
    }


    /**
     * Adds comment to report.
     *
     * @mentions get converted to markdown links with the userid as the target; eg '@chris' will be
     * converted to something like '[@chris](591d91d204815c13b2211420). This ties down the username
     * to the specific user who has that username at that time.
     *
     * @param {string}   db - Database to use.
     * @param {ObjectId} id - Report id.
     * @param {string}   comment - Comment with markdown formatting.
     * @param {ObjectId} userId - User id (for update audit trail).
     * @returns {Object} Inserted comment, including byId, byName, on, comment.
     */
    static async insertComment(db, id, comment, userId) {
        debug('Report.insertComment', 'db:'+db, 'r:'+id);

        id = objectId(id);         // allow id as string
        userId = objectId(userId); // allow userId as string

        // convert @mentions to pseudo-links with user id as target
        const users = await User.getAll();
        for (const user of users) {
            comment = comment.replace('@'+user.username, `[@${user.username}](${user._id})`);
        }

        const reports = await Db.collection(db, 'reports');

        const user = await User.get(userId);
        const values = { byId: userId, byName: user.username, on: new Date(), comment };

        try {

            await reports.updateOne({ _id: id }, { $push: { comments: values } });

        } catch (e) {
            if (e.code == 121) throw new Error(`Report ${db}/${id} failed validation [insertComment]`);
            throw e;
        }

        await Update.insert(db, id, userId, { push: { comments: comment } }); // audit trail

        return values;
    }


    /**
     * Updates comment identified by 'by', 'on' from report 'id'.
     *
     * @mentions get converted to markdown links as per insertComment().
     *
     * Note: currently, 'userId' is redundant as users can only edit their own comments, but it is
     * passed as a separate argument in case this should change in future.
     *
     * @param {string}   db - Database to use.
     * @param {ObjectId} id - Report id.
     * @param {ObjectId} by - Id of user who added comment.
     * @param {Date}     on - Timestamp comment added.
     * @param {string}   comment - Replacement comment with markdown formatting.
     * @param {ObjectId} userId - User id (for update audit trail).
     */
    static async updateComment(db, id, by, on, comment, userId) {
        debug('Report.updateComment', 'db:'+db, 'r:'+id);

        id = objectId(id);                            // allow id as string
        by = objectId(by);                            // allow id as string
        userId = objectId(userId);                    // allow userId as string
        if (!(on instanceof Date)) on = new Date(on); // allow timestamp as string
        if (isNaN(on.getTime())) throw new Error('invalid ‘on’ date');
        const commentPlain = comment;

        // convert @mentions to pseudo-links with user id as target
        const users = await User.getAll();
        let commentMd = comment;
        for (const user of users) {
            commentMd = commentMd.replace('@'+user.username, `[@${user.username}](${user._id})`);
        }

        try {

            const reports = await Db.collection(db, 'reports');
            await reports.updateOne({ _id: id, 'comments.byId': by, 'comments.on': on }, { $set: { 'comments.$.comment': commentMd } });

        } catch (e) {
            if (e.code == 121) throw new Error(`Report ${db}/${id} failed validation [updateComment]`);
            throw e;
        }

        await Update.insert(db, id, userId, { set: { [`comment-${dateFormat(on, 'yyyy-mm-dd@HH:MM')}`]: commentPlain } }); // audit trail
    }


    /**
     * Deletes comment identified by 'by', 'on' from report 'id'.
     *
     * Note: currently, 'userId' is redundant as users can only delete their own comments, but it is
     * passed as a separate argument in case this should change in future.
     *
     * @param {string}   db - Database to use.
     * @param {ObjectId} id - Report id.
     * @param {ObjectId} by - Id of user who added comment.
     * @param {Date}     on - Timestamp comment added.
     * @param {ObjectId} userId - User id (for update audit trail).
     */
    static async deleteComment(db, id, by, on, userId) {
        debug('Report.deleteComment', 'db:'+db, 'r:'+id);

        id = objectId(id);                            // allow id as string
        by = objectId(by);                            // allow id as string
        userId = objectId(userId);                    // allow id as string
        if (!(on instanceof Date)) on = new Date(on); // allow timestamp as string
        if (isNaN(on.getTime())) throw new Error('invalid ‘on’ date');

        try {

            const reports = await Db.collection(db, 'reports');
            await reports.updateOne({ _id: id }, { $pull: { comments: { byId: by, on: on } } });

        } catch (e) {
            if (e.code == 121) throw new Error(`Report ${db}/${id} failed validation [deleteComment]`);
            throw e;
        }

        await Update.insert(db, id, userId, { pull: { comments: { byId: by, on: on } } }); // audit trail
    }


    /**
     * Records report as having been viewed by current user.
     *
     * @param {string}   db - Database to use.
     * @param {ObjectId} id - Report id.
     * @param {ObjectId} userId - User id.
     */
    static async flagView(db, id, userId) {
        debug('Report.flagView', 'db:'+db, 'r:'+id, 'u:'+userId);

        id = objectId(id);         // allow id as string
        userId = objectId(userId); // allow id as string

        const reports = await Db.collection(db, 'reports');
        const report = await reports.findOne(id);

        const views = report.views || {};

        views[userId] = new Date();

        try {

            await reports.updateOne({ _id: id }, { $set: { views: views } });

        } catch (e) {
            if (e.code == 121) throw new Error(`Report ${db}/${id} failed validation [flagView]`);
            throw e;
        }

        // no audit trail, of course!
    }


    /**
     * Timestamp report was last viewed by current user.
     *
     * @param   {string}   db - Database to use.
     * @param   {ObjectId} id - Report id.
     * @param   {ObjectId} userId - User id.
     * @returns {Date} Timestamp this user last viewed this report.
     */
    static async lastViewed(db, id, userId) {
        id = objectId(id);         // allow id as string
        userId = objectId(userId); // allow id as string

        const reports = await Db.collection(db, 'reports');

        const report = await reports.findOne(id);

        return report.views ? report.views[userId] : null;
    }


    static async isVerified(db, id) {
        id = objectId(id);
        
        const reports = await Db.collection(db, 'reports');

        const report = await reports.findOne(id);

        return report.verified;
    }


    static async verifyCode(db, id, code) {
        id = objectId(id);
        
        const reports = await Db.collection(db, 'reports');

        const report = await reports.findOne(id);

        if (report.verificationCode === code.toUpperCase()) {
            try {
                await reports.updateOne({ _id: id }, { $set: { verified: true } });
            } catch (e) {
                if (e.code == 121) throw new Error(`Report ${db}/${id} failed validation [flagView]`);
                throw e;
            }
            return true;
        }

        return false;
    }

}

/**
 * Make id an ObjectId if is not already (ie if it is a string).
 *
 * @param {ObjectId|string} id - Id as ObjectId or string
 * @returns {ObjectId|null}
 */
function objectId(id) {
    if (id == undefined) return undefined;
    if (id == null) return null;
    try {
        const objId = id instanceof ObjectId ? id : new ObjectId(id);
        return objId;
    } catch (e) {
        return null;
    }
}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default Report;
