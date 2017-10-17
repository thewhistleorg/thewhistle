/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Report model.                                                                   C.Veness 2017  */
/*                                                                                                */
/* All database modifications go through the model; most querying is in the handlers.             */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import fs         from 'fs-extra';          // fs with extra functions & promise interface
import slug       from 'slug';              // make strings url-safe
import dateFormat from 'dateformat';        // Steven Levithan's dateFormat()
import exiftool   from 'exiftool-vendored'; // cross-platform Node.js access to ExifTool
import MongoDB    from 'mongodb';           // MongoDB driver for Node.js
const ObjectId = MongoDB.ObjectId;

import User    from '../models/user.js';
import Weather from '../lib/weather.js';
import AwsS3   from '../lib/aws-s3.js';
import Update  from './update.js';

/*
 * A report holds the original submitted incident report, and various metadata.
 *
 * The submitted report may be any format, though will generally be an array of name-value pairs
 * from a web form (held as a standard JavaScript object).
 *
 * This validator specifies the metadata which the app expects to find as part of the report.
 *
 * Of course, no operation should fail validation at this level: full validation should be done both
 * front-end and by the back-end app.
 */
const validator = { $and: [ // TODO: validation for string or null
    { project:    { $type: 'string',   $exists: true } }, // name of project report belongs to
    { submitted:  { $type: 'object',   $exists: true } }, // flexible format following incident reporting format
    { by:         { $type: 'objectId'                } }, // user entering incident report
    { name:       { $type: 'string',   $exists: true } }, // auto-generated name of victim/survivor
    { geocode:    { $type: 'object'                  } }, // google geocoding data
    { location:   { $type: 'object',   $exists: true } }, // GeoJSON (with spatial index)
    { analysis:   { $type: 'object'                  } }, // exif data, weather, etc
//  { summary:    { $type: 'string'                  } }, // single-line summary for identification (not currently used)
    { assignedTo: { $type: 'objectId'                } }, // user report is assigned to
    { status:     { $type: 'string'                  } },
    { tags:       { $type: 'array'                   } }, // array of strings
    { comments:   { $type: 'array'                   } }, // array of { byId, byName, on, comment }
    { views:      { $type: 'object'                  } }, // associative array of timestamps indexed by user id
    { archived:   { $type: 'bool',     $exists: true } }, // archived flag
] };

class Report {

    /**
     * Initialise new database; if not present, create 'reports' collection, add validation for it,
     * and add indexes. If everything is correctly set up, this is a no-op, so can be called freely
     * (for instance any time someone logs in).
     *
     * @param {string} db - Database to use.
     */
    static async init(db) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        // if no 'reports' collection, create it
        const collections = await global.db[db].collections();
        if (!collections.map(c => c.s.name).includes('reports')) {
            await global.db[db].createCollection('reports');
        }

        const reports = global.db[db].collection('reports');

        // TODO: if 'reports' collection doesn't have validation, add it
        //const infos = await reports.infos();
        //await global.db[db].command({ collMod: 'reports' , validator: validator }); TODO: sort out validation!

        // ---- indexing

        // indexes seem to be a bit strange in MongoDB: even determining if an index exists is not
        // straightforward; for now, just request index without testing if it already exists - this
        // seems to be fast, and is only done on explicit login

        //const indexes = (await reports.indexes()).map(i => i.key);
        //console.info('init/indexes', indexes)

        // geospatial index

        reports.createIndex({ location: '2dsphere' });

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
    }

    /**
     * Expose find method for flexible querying.
     *
     * @param   {string}   db - Database to use.
     * @param   {*}        query - Query parameter to find().
     * @returns {Object[]} Reports details.
     */
    static async find(db, query) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        const reports = global.db[db].collection('reports');
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
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        id = objectId(id); // allow id as string
        if (!id) return null;

        const reports = global.db[db].collection('reports');
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
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        const reports = global.db[db].collection('reports');
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
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        const reports = global.db[db].collection('reports');
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
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        const reports = global.db[db].collection('reports');
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
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        const reports = global.db[db].collection('reports');
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
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        const reports = global.db[db].collection('reports');
        const query = active=='active'
            ? { archived: false }
            : active=='archived' ? { archived: true } : {};
        const [ oldestReport ] = await reports.find(query).sort({ _id: 1 }).limit(1).toArray();
        if (!oldestReport) return ''; // TODO: test
        const oldestTimestamp = oldestReport._id.getTimestamp().toISOString();

        return oldestTimestamp;
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
     * @param   {string}   name - Generated name used to refer to victim/survivor.
     * @param   {Object}   submitted - Report details (values depend on project).
     * @param   {string}   project - Project report is part of.
     * @param   {Object[]} files - Uploaded files ('formidable' File objects).
     * @param   {Object}   geocode - Google geocoding results.
     * @returns {ObjectId} New report id.
     * @throws  Error on validation or referential integrity errors.
     */
    static async insert(db, by, name, submitted, project, files, geocode) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        by = objectId(by); // allow id as string

        const reports = global.db[db].collection('reports');

        // record report first, so that any file move issues don't cause us to lose it

        const values = {
            project:    project,
            submitted:  submitted,
            by:         by,
            name:       name,
            geocode:    geocode || {},
            location:   {},
            analysis:   {},
//          summary:    undefined,
            assignedTo: undefined,
            status:     undefined,
            tags:       [],
            comments:   [],
            views:      {},
            archived:   false,
        };

        // record uploaded files within the submitted report object
        values.submitted.files = files || [];

        // if successful geocode, record (geoJSON) location for (indexed) geospatial queries
        if (geocode) {
            values.location = {
                type:        'Point',
                coordinates: [Number(geocode.longitude), Number(geocode.latitude)],
            };
        }

        // record weather conditions at location & date of incident
        if (submitted.Date && submitted.Date.getTime() && geocode) {
            values.analysis.weather = await Weather.fetchWeatherConditions(geocode.latitude, geocode.longitude, submitted.Date);
        }

        //values._id = ObjectId(Math.floor(Date.now()/1000 - Math.random()*60*60*24*365).toString(16)+(Math.random()*2**64).toString(16)); // random date in past year
        const { insertedId } = await reports.insertOne(values);

        if (files) {
            // store uploaded files in AWS S3
            const date = dateFormat(insertedId.getTimestamp(), 'yyyy-mm');
            const fldr = `${project}/${date}/${insertedId}/`;
            for (const file of files) {
                if (file.size > 0) {
                    const src = file.path;
                    const dst = slug(file.name, { lower: true, remove: null });

                    // upload /tmp file to S3
                    await AwsS3.put(db, project, date, insertedId, dst, src)

                    // replace submitted.files.name with slug & .path with S3 folder
                    const filter = { _id: insertedId, 'submitted.files.path': src };
                    const path = { 'submitted.files.$.name': dst, 'submitted.files.$.path': fldr };
                    await reports.updateOne(filter, { $set: path });

                    // augment files object with EXIF metadata & save in analysis

                    file.path = fldr; // S3 folder
                    file.name = dst;  // slugified name

                    // extract EXIF metadata from files
                    const exif = await exiftool.exiftool.read(src);
                    file.exif = {
                        GPSLatitude:  exif.GPSLatitude,
                        GPSLongitude: exif.GPSLongitude,
                        CreateDate:   exif.CreateDate, // TODO: JS Date object?
                    };

                    await reports.updateOne({ _id: insertedId }, { $push: { 'analysis.files': file } });

                    // delete uploaded file from /tmp
                    await fs.remove(src);
                }
            }
        }

        return insertedId; // TODO: toString()? entire document?
    }


    /**
     * Update Report details.
     *
     * @param  {string}   db - Database to use.
     * @param  {ObjectId} id - Report id.
     * @param  {Object}   values - Report details.
     * @param  {ObjectId} userId - User id (for update audit trail).
     * @throws Error on validation or referential integrity errors.
     */
    static async update(db, id, values, userId) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        id = objectId(id);         // allow id as string
        userId = objectId(userId); // allow id as string

        if (values.submitted != undefined) throw new Error('Cannot update submitted report');

        const reports = global.db[db].collection('reports');

        await reports.updateOne({ _id: id }, { $set: values });

        await Update.insert(db, id, userId, { set: values }); // audit trail
    }


    /**
     * Delete entire Report. Normally only for testing purposes.
     *
     * @param  {string}   db - Database to use.
     * @param  {ObjectId} id - Report id.
     * @throws Error if MongoDB delete fails or remove directory fails.
     */
    static async delete(db, id) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        id = objectId(id); // allow id as string

        // retrieve report to determine project, in case there are persistent files to delete
        const report = await Report.get(db, id);

        // delete audit trail
        await Update.deleteForReport(db, id);

        // delete report
        const reports = global.db[db].collection('reports');
        await reports.deleteOne({ _id: id });

        // delete any uploaded files
        await AwsS3.deleteReportObjects(db, report.project, dateFormat(id.getTimestamp(), 'yyyy-mm'), id);
    }


    /**
     * List all statuses used
     *
     * TODO: restrict by eg agency, age?
     * TODO: better name?
     *
     * @param   {string}   db - Database to use.
     * @returns {string[]} Array of statuses currently in use (unsorted).
     */
    static async statuses(db) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

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
     * List all tags used.
     *
     * TODO: restrict by eg assignedTo, status?
     * TODO: better name?
     *
     * @param   {string}   db - Database to use.
     * @returns {string[]} Array of tags currently in use.
     */
    static async tags(db) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        // TODO: more efficient way to do this?
        const reports = await Report.getAll(db);

        const tags = new Set();
        for (const report of reports) {
            for (const tag of report.tags) tags.add(tag);
        }

        return [ ...tags ].sort();
    }


    /**
     * Add tag to report.
     *
     * @param {string}   db - Database to use.
     * @param {ObjectId} id - Report id.
     * @param {string}   tag - Tag to be added.
     * @param {ObjectId} userId - User id (for update audit trail).
     */
    static async insertTag(db, id, tag, userId) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        id = objectId(id);         // allow id as string
        userId = objectId(userId); // allow id as string

        const reports = global.db[db].collection('reports');
        await reports.updateOne({ _id: id }, { $addToSet: { tags: tag } });

        await Update.insert(db, id, userId, { addToSet: { tags: tag } }); // audit trail
    }


    /**
     * Delete tag from report.
     *
     * @param {string}   db - Database to use.
     * @param {ObjectId} id - Report id.
     * @param {string}   tag - Tag to be deleted.
     * @param {ObjectId} userId - User id (for update audit trail).
     */
    static async deleteTag(db, id, tag, userId) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        id = objectId(id);         // allow id as string
        userId = objectId(userId); // allow id as string

        const reports = global.db[db].collection('reports');
        await reports.updateOne({ _id: id }, { $pull: { tags: tag } });

        await Update.insert(db, id, userId, { pull: { tags: tag } }); // audit trail
    }


    /**
     * Add comment to report.
     *
     * This could currently be achieved with Report.update(), but will probably involve more
     * processing in future. It also mirrors Report.deleteComment().
     *
     * @param {string}   db - Database to use.
     * @param {ObjectId} id - Report id.
     * @param {string}   comment - Comment with markdown formatting.
     * @param {ObjectId} userId - User id (for update audit trail).
     * @returns {Object} Inserted comment, including byId, byName, on, comment.
     */
    static async insertComment(db, id, comment, userId) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        id = objectId(id);         // allow id as string
        userId = objectId(userId); // allow id as string

        const reports = global.db[db].collection('reports');
        const user = await User.get(userId);
        const values = { byId: userId, byName: user.username, on: new Date(), comment }
        await reports.updateOne({ _id: id }, { $push: { comments: values } });

        await Update.insert(db, id, userId, { push: { comments: comment } }); // audit trail

        return values;
    }


    /**
     * Delete comment identified by 'by', 'on' from report 'id'.
     *
     * @param {string}   db - Database to use.
     * @param {ObjectId} id - Report id.
     * @param {ObjectId} by - Id of user who added comment.
     * @param {Date}     on - Timestamp comment added.
     * @param {ObjectId} userId - User id (for update audit trail).
     */
    static async deleteComment(db, id, by, on, userId) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        id = objectId(id);                            // allow id as string
        by = objectId(by);                            // allow id as string
        userId = objectId(userId);                    // allow id as string
        if (!(on instanceof Date)) on = new Date(on); // allow timestamp as string
        if (isNaN(on.getTime())) throw new Error('invalid ‘on’ date');

        const reports = global.db[db].collection('reports');
        await reports.updateOne({ _id: id }, { $pull: { comments: { byId: by, on: on } } });

        await Update.insert(db, id, userId, { pull: { comments: { byId: by, on: on } } }); // audit trail
    }


    /**
     * Record report as having been viewed by current user.
     *
     * @param {string}   db - Database to use.
     * @param {ObjectId} id - Report id.
     * @param {ObjectId} userId - User id.
     */
    static async flagView(db, id, userId) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        id = objectId(id);         // allow id as string
        userId = objectId(userId); // allow id as string

        const reports = global.db[db].collection('reports');
        const report = await reports.findOne(id);

        const views = report.views || {};

        views[userId] = new Date();

        await reports.updateOne({ _id: id }, { $set: { views: views } });

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
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        id = objectId(id);         // allow id as string
        userId = objectId(userId); // allow id as string

        const reports = global.db[db].collection('reports');

        const report = await reports.findOne(id);

        return report.views ? report.views[userId] : null;
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
    try {
        const objId = id instanceof ObjectId ? id : new ObjectId(id);
        return objId;
    } catch (e) {
        return null;
    }
}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default Report;
