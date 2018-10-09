/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Routes for main app (reports, messages, user-agents, notes).               C.Veness 2017-2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

/* eslint space-in-parens: off */

import Router from 'koa-router'; // router middleware for koa
import send   from 'koa-send';   // static file serving
const router = new Router();


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Dashboard routes - TBC                                                                        */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

// import dashboard from './dashboard.js';
//
// router.get('/dashboard/\\*',       dashboard.general); // render general dashboard page
// router.get('/dashboard/:username', dashboard.user);    // render users’ dashboard page


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Notifications routes                                                                          */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import notifications from './notifications.js';

router.get(   '/ajax/notifications',               notifications.ajaxList);       // list current notifications
router.get(   '/ajax/notifications/last-update',   notifications.ajaxLastUpdate); // timestamp of last notification
router.delete('/ajax/notifications/:notification', notifications.ajaxDismiss);    // dismiss notification
router.get(   '/ajax/notifications/debug',         notifications.ajaxListDebug);  // list all notifications for debug


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Reports routes                                                                                */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import reports from './reports.js';

router.get('/reports',                 reports.list);            // render reports search/list page
router.get('/reports-map',             reports.map);             // render reports search/map page
router.get('/reports/export-xls',      reports.exportXls);       // download XLS list of reports
router.get('/reports/export-pdf',      reports.exportPdf);       // download PDF list of reports
router.get('/reports/export-pdf/:id',  reports.exportPdfSingle); // download PDF of report
router.get('/reports/:id',             reports.viewReport);      // render view report tab

router.post('/reports/:id',            reports.processView);     // process report view submit
router.post('/reports/:id/delete',     reports.processDelete);   // process delete report

// ---- ajax routes

router.get(   '/ajax/reports/latest-timestamp',      reports.ajaxReportLatestTimestamp);
router.get(   '/ajax/reports/within/:s,:w::n,:e',    reports.ajaxReportsWithin);
router.post(  '/ajax/reports/:id/tags',              reports.ajaxReportPostTag);
router.delete('/ajax/reports/:id/tags/:tag',         reports.ajaxReportDeleteTag);
router.post(  '/ajax/reports/:id/comments',          reports.ajaxReportPostComment);
router.put(   '/ajax/reports/:id/comments/:comment', reports.ajaxReportPutComment);
router.delete('/ajax/reports/:id/comments/:comment', reports.ajaxReportDeleteComment);
router.get(   '/ajax/reports/:id/updates',           reports.ajaxReportGetUpdates);
router.put(   '/ajax/reports/:id/location',          reports.ajaxReportPutLocation);
router.put(   '/ajax/reports/:id/latlon',            reports.ajaxReportPutLatLon);


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Messages routes                                                                               */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import messages from './messages.js';

router.get('/messages',             messages.list);          // render list messages page

router.post('/messages',            messages.processSend);   // process send message
router.post('/messages/:id/delete', messages.processDelete); // process delete message

// ---- ajax routes

router.get('/ajax/messages/latest-timestamp', messages.ajaxMessageLatestTimestamp);


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Route for map marker (TODO: where should this go?)                                            */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import Jimp from 'jimp';     // image processing library
import fs   from 'fs-extra'; // fs with extra functions & promise interface

/**
 * Render graduated map marker: 0 for transparent/monochrome -> 100 for opaque/red.
 *
 * Graduated markers can be used on maps to indicate how recent reports are, with most recent
 * showing up brightest.
 */
router.get('/map-marker/:colour/:percentage', async function getMapMarker(ctx) {
    const colour = ctx.params.colour;
    const percentageInt = Math.round(ctx.params.percentage); // 0 = transparent/monochrome, 100 = full color
    const percentage = Math.max(Math.min(percentageInt, 100), 0); // constrain to 0..100
    const path = 'static/map/marker-'+colour+'-'+percentage+'.png';

    const maxage = ctx.app.env=='production' ? 1000*60*60*24 : 1000;

    if (await fs.exists(path)) {
        await send(ctx, path, { maxage: maxage });
    } else {
        const marker = await Jimp.read('static/map/marker-'+colour+'.png');
        const outline = await Jimp.read('static/map/marker-'+colour+'-outline.png');
        marker.opacity(percentage/100);
        marker.composite(outline, 0, 0);
        marker.color([ { apply: 'desaturate', params: [ 100-percentage ] } ]);
        await marker.writePromise(path);
        await send(ctx, path, { maxage: maxage });
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

import users from './users.js';

router.get('/users',             users.list);            // render list users page
router.get('/users/add',         users.add);             // render add user page
router.get('/users/:id',         users.view);            // render view user details page
router.get('/users/:id/edit',    users.edit);            // render edit user page

router.post('/users/add',        users.processAdd);      // process add user
router.post('/users/:id/edit',   users.processEdit);     // process edit user
router.post('/users/:id/delete', users.processDelete);   // process delete user

router.get('/ajax/users',        users.ajaxUserDetails); // get user details


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Form Specifications routes                                                                    */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import formSpecs from './form-specifications.js';

router.get('/form-specifications',             formSpecs.list);          // render list form-specifications page
router.get('/form-specifications/add',         formSpecs.add);           // render add form-specification page
router.get('/form-specifications/:id/edit',    formSpecs.edit);          // render edit form-specification page

router.post('/form-specifications/add',        formSpecs.processAdd);    // process add form-specification
router.post('/form-specifications/:id/edit',   formSpecs.processEdit);   // process edit form-specification
router.post('/form-specifications/:id/delete', formSpecs.processDelete); // process delete form-specification

router.get('/ajax/form-specifications/:id',    formSpecs.ajaxFormSpec);  // get form spec


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Resources routes                                                                              */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import resources from './resources.js';

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

import AwsS3 from '../lib/aws-s3.js';

router.get('/uploaded/:project/:date/:id/:file', async function getUploadedFile(ctx) {
    try {
        const db = ctx.state.user.db;
        const { project, date, id, file } = ctx.params;

        ctx.response.body = await AwsS3.getBuffer(db, project, date, id, file);

        ctx.response.type = file.lastIndexOf('.') > 0
            ? file.slice(file.lastIndexOf('.')) // kosher extension
            : 'application/octet-stream';       // no extension or initial dot
        ctx.response.set('Cache-Control', 'public, max-age=' + (ctx.app.env=='production' ? 60*60*24 : 1));
        // TODO: Last-Modified?
    } catch (e) {
        ctx.throw(e.statusCode, e.message);
    }
});


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Geocode address                                                                               */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import Ip       from '../lib/ip';
import Geocoder from '../lib/geocode';

/**
 * Get geocode details for given address. Results are weighted to country of originating request,
 * determined from IP address.
 *
 * This only returns the formattedAddress field, as otherwise it could be used as a free
 * authenticated proxy for Google's geolocation service.
 *
 * Mirrors similar function in report app.
 */
router.get('/ajax/geocode', async function getGeocode(ctx) {
    const region = ctx.request.query.region ? ctx.request.query.region : await Ip.getCountry(ctx.request.ip);
    const geocoded = await Geocoder.geocode(ctx.request.query.address, region);

    if (geocoded) {
        // if region is specified, treat it as a requirement not just as bias as Google does
        if (ctx.request.query.region && ctx.request.query.region.toUpperCase()!=geocoded.countryCode) { ctx.response.status = 404; return; }

        ctx.response.body = { formattedAddress: geocoded.formattedAddress };
        ctx.response.body.root = 'geocode';
        ctx.response.status = 200; // Ok
    } else {
        ctx.response.status = 404; // Not Found
    }
});


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Group routes                                                                                  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import groups from './groups.js';

router.get('/groups', groups.getGroupsPage);
router.get('/create-group', groups.getCreateGroupPage);

router.post('/create-group', groups.postCreateGroup);
router.post('/delete-group/:group', groups.postDeleteGroup);
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default router.middleware();
