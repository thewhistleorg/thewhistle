/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Routes for main app (reports, messages, user-agents, notes )                                  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const router = require('koa-router')(); // router middleware for koa
const send   = require('koa-send');     // static file serving



/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Dashboard routes                                                                              */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

const dashboard = require('./dashboard.js');

router.get('/dashboard/\\*',       dashboard.general); // render general dashboard page
router.get('/dashboard/:username', dashboard.user);    // render users’ dashboard page

// ---- ajax routes

router.get('/ajax/dashboard/reports/latest-timestamp', dashboard.ajaxReportLatestTimestamp);

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Incident report submission routes                                                             */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

const report = require('./report.js');

router.get( '/report/:project',             report.getReportEntry);      // render incident report entry page
router.post('/report/:project',             report.processReportEntry);  // process incident report entry
router.get( '/report/:project/submit',      report.getReportSubmit);     // render incident report review+submit page
router.post('/report/:project/submit',      report.processReportSubmit); // process incident report review+submit
router.get( '/report/:project/:id/confirm', report.getReportConfirm);    // render incident report confirm page

// ---- ajax routes

router.get('/ajax/report/:db/names/new',   report.getGenerateNewName); // get newly generated name
router.get('/ajax/report/:db/names/:name', report.getName);            // check previously used name does exist


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Reports routes                                                                                */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

const reports = require('./reports.js');

router.get('/reports',                 reports.list);            // render reports search/list page
router.get('/reports-map',             reports.map);             // render reports search/map page
router.get('/reports/export-csv',      reports.exportCsv);       // download CSV list of reports
router.get('/reports/export-pdf',      reports.exportPdf);       // download PDF list of reports
router.get('/reports/export-pdf/:id',  reports.exportPdfSingle); // download PDF of report
router.get('/reports/:id',             reports.viewReport);      // render view report tab
router.get('/reports/:id/edit',        reports.edit);            // render edit report details page
router.get('/reports/:id/delete',      reports.delete);          // render delete a report page

router.post('/reports/:id',            reports.processView);     // process report view submit
router.post('/reports/:id/edit',       reports.processEdit);     // process edit report
router.post('/reports/:id/delete',     reports.processDelete);   // process delete report

// ---- ajax routes

router.get(   '/ajax/reports/within/:s,:w::n,:e',        reports.ajaxReportsWithin);
router.post(  '/ajax/reports/:id/tags',                  reports.ajaxReportPostTag);
router.delete('/ajax/reports/:id/tags/:tag',             reports.ajaxReportDeleteTag);
router.post(  '/ajax/reports/:report/comments',          reports.ajaxReportPostComment);
router.delete('/ajax/reports/:report/comments/:comment', reports.ajaxReportDeleteComment);
router.delete('/ajax/reports/:id/updates',               reports.ajaxReportDeleteUpdates);


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Messages routes                                                                               */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

const messages = require('./messages.js');

router.get('/messages',             messages.list);          // render list messages page
router.get('/messages/:id',         messages.view);          // render view message details page
router.get('/messages/:id/edit',    messages.edit);          // render edit message details page
router.get('/messages/:id/delete',  messages.delete);        // render delete a message page

router.post('/messages',            messages.processSend);   // process send message
router.post('/messages/:id/edit',   messages.processEdit);   // process edit message
router.post('/messages/:id/delete', messages.processDelete); // process delete message

// ---- ajax routes

router.get('/ajax/messages/latest-timestamp', messages.ajaxMessageLatestTimestamp);


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Route for map marker (TODO: where should this go?)                                            */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

const Jimp = require('jimp');     // image processing library
const fs   = require('fs-extra'); // fs with extra functions & promise interface

/**
 * Render graduated map marker: 0 for transparent/monochrome -> 100 for opaque/red.
 *
 * Graduated markers can be used on maps to indicate how recent reports are, with most recent
 * showing up brightest.
 */
router.get('/map-marker/:colour/:percentage', async function getMapMarker(ctx) {
    const colour = ctx.params.colour;
    const percentage = Math.round(ctx.params.percentage); // 0 = transparent/monochrome, 100 = full color
    const path = 'static/map/marker-'+colour+'-'+percentage+'.png';

    if (await fs.exists(path)) {
        await send(ctx, path, { maxage: 1 }); // 1000*60*60
    } else {
        const marker = await Jimp.read('static/map/marker-'+colour+'.png');
        const outline = await Jimp.read('static/map/marker-'+colour+'-outline.png');
        marker.opacity(percentage/100);
        marker.composite(outline, 0, 0);
        marker.color([ { apply: 'desaturate', params: [ 100-percentage ] } ]);
        await marker.writePromise(path);
        await send(ctx, path, { maxage: 1000*60*60 });
    }
});

/**
 * Writes the image to a file, returning a promise.
 *
 * @param {string} path - A path to the destination file (either PNG or JPEG)
 * @returns {Promise}
 */
Jimp.prototype.writePromise = function(path) {
    return new Promise(function(resolve, reject) {
        this.write(path, function (err) {
            if (err) return reject(err);
            resolve(null);
        });
    }.bind(this));
};


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Users routes                                                                                  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

const users = require('./users.js');

router.get('/users',             users.list);            // render list users page
router.get('/users/add',         users.add);             // render add user page
router.get('/users/:id/edit',    users.edit);            // render edit user page

router.post('/users/add',        users.processAdd);      // process add user
router.post('/users/:id/edit',   users.processEdit);     // process edit user
router.post('/users/:id/delete', users.processDelete);   // process delete user

router.get('/ajax/users',        users.ajaxUserDetails); // get user details


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Resources routes                                                                              */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

const resources = require('./resources.js');

router.get('/resources',             resources.list);          // render list resources page
router.get('/resources/add',         resources.add);           // render add resource page
router.get('/resources/:id/edit',    resources.edit);          // render edit resource page

router.post('/resources/add',        resources.processAdd);    // process add resource
router.post('/resources/:id/edit',   resources.processEdit);   // process edit resource
router.post('/resources/:id/delete', resources.processDelete); // process delete resource


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Uploaded files routes                                                                         */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

// uploaded file requests are proxied through to AWS S3

const AwsS3 = require('../lib/aws-s3.js');

router.get('/uploaded/:project/:date/:id/:file', async function getUploadedFile(ctx) {
    try {
        const db = ctx.state.user.db;
        const { project, date, id, file } = ctx.params;

        ctx.body = await AwsS3.getBuffer(db, project, date, id, file);

        ctx.type = file.lastIndexOf('.') > 0
            ? file.slice(file.lastIndexOf('.')) // kosher extension
            : 'application/octet-stream';       // no extension or initial dot
        ctx.set('Cache-Control', 'public, max-age=' + (ctx.app.env=='production' ? 60*60*24 : 1));
        // TODO: Last-Modified?
    } catch (e) {
        ctx.throw(e.statusCode, e.message);
    }
});


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = router.middleware();
