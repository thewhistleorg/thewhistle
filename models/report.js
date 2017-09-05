/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Report model                                                                                   */
/*                                                                                                */
/* All database modifications go through the model; most querying is in the handlers.             */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const fs         = require('fs-extra');          // fs with extra functions & promise interface
const slug       = require('slug');              // make strings url-safe
const dateFormat = require('dateformat');        // Steven Levithan's dateFormat()
const exiftool   = require('exiftool-vendored'); // cross-platform Node.js access to ExifTool
const ObjectId   = require('mongodb').ObjectId;

const Weather = require('../lib/weather.js');
// const Update = require('./update.js'); !! this is done at the bottom of the file to resolve Node cyclic references!

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
    { report:     { $type: 'object',   $exists: true } }, // flexible format following incident reporting format
    { by:         { $type: 'objectId',               } }, // user entering incident report
    { name:       { $type: 'string',   $exists: true } }, // auto-generated name of victim/survivor
    { geocode:    { $type: 'object',                 } }, // google geocoding data
    { location:   { $type: 'object',   $exists: true } }, // GeoJSON (with spatial index)
    { summary:    { $type: 'string',                 } }, // single-line summary for identification
    { assignedTo: { $type: 'objectId',               } }, // user report is assigned to
    { status:     { $type: 'string',                 } },
    { tags:       { $type: 'array',                  } }, // array of strings
    { comments:   { $type: 'array',                  } }, // array of { byId, byName, on, comment }
    { archived:   { $type: 'bool',     $exists: true } }, // archived flag
    { views:      { $type: 'object'                  } }, // associative array of timestamps indexed by user id
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

        // if 'reports' collection doesn't have correct indexes, add them
        const indexes = (await reports.indexes()).map(i => i.key);

        // geospatial index
        if (indexes.location == undefined) reports.createIndex({ location: '2dsphere' });

        // free-text index (on submitted report fields) TODO: what happens when new report fields added?
        if (indexes._fts == undefined) {
            // get all submitted fields in all reports
            const allRpts = await Report.getAll(db);
            const flds = new Set;
            for (const rpt of allRpts) {
                for (const fld of Object.keys(rpt.report)) flds.add(fld);
            }
            flds.delete('_id');
            const fields = {};
            for (const f of flds) fields['report.'+f] = 'text';
            //reports.createIndex({ '$**': 'text' }); // creates free-text search index on entire collection
            reports.createIndex(fields, { name: 'freetextfieldssearch' });
        }
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

        try {
            if (!(id instanceof ObjectId)) id = new ObjectId(id); // allow id as string
        } catch (e) {
            return null; // invalid id TODO: best to return null or allow exception through?
        }

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
        const [lastReport] = await reports.find(query).sort({ _id: -1 }).limit(1).toArray();
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
        const [oldestReport] = await reports.find(query).sort({ _id: 1 }).limit(1).toArray();
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
     * @param   {Object}   report - Report details (values depend on project).
     * @param   {string}   project - Project report is part of.
     * @param   {Object[]} files - Uploaded files ('formidable' File objects).
     * @param   {Object}   geocode - Google geocoding results.
     * @returns {ObjectId} New report id.
     * @throws  Error on validation or referential integrity errors.
     */
    static async insert(db, by, name, report, project, files, geocode) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        if (typeof by == 'string') by = new ObjectId(by); // allow id as string

        const reports = global.db[db].collection('reports');

        // record report first, so that any file move issues don't cause us to lose it

        const values = {
            project:    project,
            by:         by,
            name:       name,
            report:     report,
            geocode:    geocode || {},
            location:   {},
            analysis:   {},
            summary:    undefined,
            assignedTo: undefined,
            status:     undefined,
            tags:       [],
            comments:   [],
            archived:   false,
        };

        // record uploaded files within the submitted report object
        values.report.files = files || [];

        // if successful geocode, record (geoJSON) location for (indexed) geospatial queries
        if (geocode) {
            values.location = {
                type:        'Point',
                coordinates: [ Number(geocode.longitude), Number(geocode.latitude) ],
            };
        }

        // record weather conditions at location & date of incident
        const incidentOn = new Date(report.date+' '+report.time);
        if (incidentOn.getTime() && geocode) {
            values.analysis.weather = await Weather.fetchWeatherConditions(geocode.latitude, geocode.longitude, incidentOn);
        }

        //values._id = ObjectId(Math.floor(Date.now()/1000 - Math.random()*60*60*24*365).toString(16)+(Math.random()*2**64).toString(16)); // random date in past year
        const { insertedId } = await reports.insertOne(values);

        if (files) {
            // move uploaded files from /tmp into ./static [note: NOT ./public!]
            const dir = `${db}/${project}/${dateFormat('yyyy-mm')}/${insertedId}/`;
            for (const file of files) {
                if (file.size > 0) {
                    const src = file.path;
                    const dst = slug(file.name, { lower: true, remove: null });

                    // move from tmp to static
                    await fs.copy(src, './static/'+dir+dst); // TODO: use AWS for persistent file storage
                    await fs.remove(src);
                    file.name = dst;
                    file.path = dir;

                    // replace name with slug & path with saved file location
                    const filter = { _id: insertedId, 'report.files.path': src };
                    const path = { 'report.files.$.name': dst, 'report.files.$.path': dir };
                    await reports.updateOne(filter, { $set: path });

                    // augment files object with EXIF metadata & save in analysis

                    // extract EXIF metadata from files
                    const exif = await exiftool.exiftool.read('./static/'+dir+dst);
                    file.exif = {
                        GPSLatitude:  exif.GPSLatitude,
                        GPSLongitude: exif.GPSLongitude,
                        CreateDate:   exif.CreateDate, // TODO: JS Date object?
                    };

                    await reports.updateOne({ _id: insertedId }, { $push: { 'analysis.files': file } });

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

        if (!(id instanceof ObjectId)) id = new ObjectId(id);             // allow id as string
        if (!(userId instanceof ObjectId)) userId = new ObjectId(userId); // allow id as string

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

        if (!(id instanceof ObjectId)) id = new ObjectId(id); // allow id as string

        // retrieve report to determine project, in case there are persistent files to delete
        const report = await Report.get(db, id);

        // delete audit trail
        Update.deleteForReport(db, id);

        // delete report
        const reports = global.db[db].collection('reports');
        await reports.deleteOne({ _id: id });

        // delete any uploaded files
        const dir = `static/${db}/${report.project}/${dateFormat(id.getTimestamp(), 'yyyy-mm')}/${id}/`;
        await fs.remove(dir);
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

        return [...statuses].sort();
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

        return [...tags].sort();
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

        if (!(id instanceof ObjectId)) id = new ObjectId(id);             // allow id as string
        if (!(userId instanceof ObjectId)) userId = new ObjectId(userId); // allow id as string

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

        if (!(id instanceof ObjectId)) id = new ObjectId(id);             // allow id as string
        if (!(userId instanceof ObjectId)) userId = new ObjectId(userId); // allow id as string

        const reports = global.db[db].collection('reports');
        await reports.updateOne({ _id: id }, { $pull: { tags: tag } });

        await Update.insert(db, id, userId, { pull: { tags: tag } }); // audit trail
    }


    /**
     * Add comment to report.
     *
     * @param {string}   db - Database to use.
     * @param {ObjectId} id - Report id.
     * @param {string}   comment - Comment with markdown formatting.
     * @param {ObjectId} userId - User id (for update audit trail).
     */
    static async insertComment(db, id, comment, userId) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        if (!(id instanceof ObjectId)) id = new ObjectId(id);             // allow id as string
        if (!(userId instanceof ObjectId)) userId = new ObjectId(userId); // allow id as string

        const reports = global.db[db].collection('reports');
        const user = await User.get(userId);
        await reports.updateOne({ _id: id }, { $push: { comments: { byId: userId, byName: user.username, on: new Date(), comment } } });

        await Update.insert(db, id, userId, { push: { comments: comment } }); // audit trail
    }


    /**
     * Delete specified comment from report.
     *
     * @param {string}   db - Database to use.
     * @param {ObjectId} id - Report id.
     * @param {ObjectId} by - Id of user who added comment.
     * @param {Date}     on - Timestamp comment added.
     * @param {string}   comment - Comment with markdown formatting.
     * @param {ObjectId} userId - User id (for update audit trail).
     */
    static async deleteComment(db, id, by, on, userId) {
        if (!global.db[db]) throw new Error(`database ‘${db}’ not found`);

        if (!(id instanceof ObjectId)) id = new ObjectId(id);             // allow report id as string
        if (!(by instanceof ObjectId)) by = new ObjectId(by);             // allow by id as string
        if (!(on instanceof Date))     on = new Date(on);                 // allow timestamp as string
        if (!(userId instanceof ObjectId)) userId = new ObjectId(userId); // allow id as string

        const reports = global.db[db].collection('reports');
        await reports.updateOne({ _id: new id }, { $pull: { comments: { byId: id, on: on } } });

        await Update.insert(db, id, userId, { pull: { comments: { byId: id, on: on } } }); // audit trail
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

        if (!(id instanceof ObjectId)) id = new ObjectId(id);             // allow id as string
        if (!(userId instanceof ObjectId)) userId = new ObjectId(userId); // allow id as string

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

        if (!(id instanceof ObjectId)) id = new ObjectId(id);             // allow id as string
        if (!(userId instanceof ObjectId)) userId = new ObjectId(userId); // allow id as string

        const reports = global.db[db].collection('reports');
        const report = await reports.findOne(id);

        return report.views ? report.views[userId] : null;
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = Report;

// Update is 'require'd at the bottom of the file to resolve Node's cyclic references deficiency:
// see stackoverflow.com/questions/10869276#answer-14098262
const Update = require('./update.js');
