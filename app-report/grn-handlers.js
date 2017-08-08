/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* WWW handlers (invoked by router to render templates)                                           */
/*                                                                                                */
/* All functions here either render or redirect, or throw.                                        */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const Geocoder = require('node-geocoder'); // library for geocoding and reverse geocoding

const Report = require('../models/report.js');

const jsObjectToHtml   = require('../lib/js-object-to-html.js');
const useragent        = require('../lib/user-agent.js');
const validationErrors = require('../lib/validation-errors.js');

const nPages = 8;

const validation = {
    3: { date: 'type=date required', time: 'type=time required' },
    4: { 'brief-description': 'required' },
    5: { 'location-address': 'required' },
    '*': { date: 'type=date required', time: 'type=time required', 'brief-description': 'required', 'location-address': 'required' },
};

class Grn {

    /**
     * Render GRN incident report index page.
     */
    static async getIndex(ctx) {
        ctx.session.report = {};
        ctx.session.completed = 0;
        await ctx.render('grn/index');
    }


    /**
     * Render report page.
     */
    static async getPage(ctx) {
        if (!ctx.session.report) { ctx.flash = { expire: 'Your session has expired' }; ctx.redirect('/grn'); return; }

        const page = ctx.params.num=='*' ? '+' : Number(ctx.params.num); // note '+' is allowed on windows, '*' is not
        if (page > ctx.session.completed+1) { ctx.redirect('/grn/'+(ctx.session.completed+1)); return; }

        const context = Object.assign({ p: page, n: nPages }, ctx.session.report);

        await ctx.render('grn/'+page, context);
    }


    /**
     * Process 'next' / 'previous' page submissions.
     */
    static async postPage(ctx) {
        if (!ctx.session.report) { ctx.redirect('/grn'); return; }
        const page = ctx.params.num=='*' ? '*' : Number(ctx.params.num);
        ctx.session.completed = Number(page);

        const body = ctx.request.body; // shorthand

        if (body.fields) {

            // multipart/form-data: move body.fields.* to body.* to match
            // x-www-form-urlencoded forms (note cannot use field named 'files'!)
            for (const field in body.fields) body[field] = body.fields[field];
            delete body.fields;

            // file input fields are named 'documents'; move File objects up to be immediately under 'files'
            body.files = body.files['documents'];
            // normalise files to be array of File objects (koa-body does not provide array if just 1 file uploaded)
            if (!Array.isArray(body.files)) body.files = [body.files];
            // strip out any 0-size files
            for (let f=0; f<body.files.length; f++) if (body.files[f].size == 0) body.files.splice(f, 1);
        }

        switch (page) {
            case '*':
            case 1: // bespoke validation required for identifier-name
                if (body['existing-name'] != null) {
                    // verify existing name does exist
                    const reports = await Report.getBy('test', 'report.identifier-name', body['existing-name']);
                    if (reports.length == 0) { ctx.flash = 'Name not found'; ctx.redirect(ctx.url); }
                    body['identifier-name'] = body['existing-name'];
                } else {
                    // verify generated name does not exist
                    if (body['generated-name'] == null) { ctx.flash = 'Name not given'; ctx.redirect(ctx.url); }
                    const reports = await Report.getBy('test', 'report.identifier-name', body['generated-name']);
                    if (reports.length > 0) { ctx.flash = 'Generated name not available'; ctx.redirect(ctx.url); }
                    body['identifier-name'] = body['generated-name'];
                }
                if (page != '*') break; // eslint-disable-line no-fallthrough
            case 6: // set blank radio/checkbox fields to null
                body['perpetrator-gender'] = body['perpetrator-gender'] || null;
                if (page != '*') break; // eslint-disable-line no-fallthrough
        }
        if (validationErrors(body, validation[page])) {
            ctx.flash = { validation: validationErrors(body, validation[page]) };
            ctx.redirect(ctx.url); return;
        }

        const go = body['nav-next'] ? page + 1 : page - 1;

        delete body['nav-prev'];
        delete body['nav-next'];

        ctx.session.report = Object.assign(ctx.session.report, body);
        ctx.redirect('/grn/'+(go<=nPages ? go : 'submit'));
    }


    /* submit  - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


    /**
     * Render 'review & submit' page.
     */
    static async getSubmit(ctx) {
        if (!ctx.session.report) { ctx.redirect('/grn'); return; }

        // geocode location (specific to GRN!)
        const geocoder = Geocoder();
        try {
            [ctx.session.geocode] = await geocoder.geocode(ctx.session.report['location-address']);
        } catch (e) {
            console.error('Geocoder error', e);
            ctx.session.geocode = null;
        }
        // make sure only one of generated-name and existing-name are recorded, and make it 1st property of report
        if (ctx.session.report['existing-name']) { delete ctx.session.report['generated-name']; ctx.session.report = Object.assign({ 'existing-name': null }, ctx.session.report); }
        if (ctx.session.report['generated-name']) { delete ctx.session.report['existing-name']; ctx.session.report = Object.assign({ 'generated-name': null }, ctx.session.report); }

        const context = { reportHtml: jsObjectToHtml(ctx.session.report), geocodeHtml: jsObjectToHtml(ctx.session.geocode) };

        await ctx.render('grn/submit', context);
    }


    /**
     * Process 'review & submit' submission.
     */
    static async postSubmit(ctx) {
        if (!ctx.session.report) { ctx.redirect('/grn'); return; }
        if (ctx.request.body['nav-prev'] == 'prev') { ctx.redirect('/grn/'+nPages); return; }

        // record this report
        delete ctx.request.body['submit'];

        const name = ctx.session.report['existing-name'] || ctx.session.report['generated-name'];

        const id = await Report.insert('test', undefined, name, ctx.session.report, 'sexual-assault', ctx.session.files, ctx.session.geocode);
        ctx.set('X-Insert-Id', id); // for integration tests

        // record user-agent
        await useragent.log('test', ctx.ip, ctx.headers);

        ctx.session = null;
        ctx.redirect('/grn/');
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = Grn;
