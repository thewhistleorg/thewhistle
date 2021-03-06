/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Resources handlers - manage adding, editing, deleting rape/crisis resources.                   */
/*                                                                            C.Veness 2017-2018  */
/*                                                                                                */
/* GET functions render template pages; POST functions process post requests then redirect.       */
/*                                                                                                */
/* Ajax functions set body & status, and should not throw (as that would  invoke the generic      */
/* admin exception handler which would return an html page).                                      */
/*                                                                                                */
/*                                  © 2017-2018 Cambridge University / The Whistle | MIT licence  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import { PhoneNumberUtil, PhoneNumberFormat } from 'google-libphonenumber'; // wrapper for Google's libphonenumber
import isEmail                                from 'isemail';               // email address validation library

import Resource         from '../models/resource.js';
import validationErrors from '../lib/validation-errors.js';
import Geocoder         from '../lib/geocode.js';
import Db               from '../lib/db.js';

const phoneUtil = PhoneNumberUtil.getInstance();


const validation = {
    name: 'required',
};

class Handlers {

    /**
     * GET /resources/add - Render add resource page.
     */
    static async add(ctx) {
        const availableDatabases = Object.keys(Db.databases).filter(db => db!='resources');
        const context = Object.assign({ availableDatabases }, ctx.flash.formdata);
        await ctx.render('resources-add', context);
    }


    /**
     * GET /resources - Render list resources page.
     */
    static async list(ctx) {
        const db = ctx.state.user.db;

        // get resources matching querystring filter
        const query = ctx.request.query.category ? { category: ctx.request.query.category } : {};
        const resources = await Resource.find(db, query);

        resources.sort((a, b) => a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1);

        // pretty format phone, email, services
        resources.forEach(r => {
            r.phone = formatPhoneNumbers(r.phone, 'NG'); // TODO: derive country code from database
            r.email = formatEmails(r.email);
            r.website = formatUrl(r.website);
            r.services = r.services.join('; ');
        });

        // list of categories for filter <select>
        let allCategories = [];
        (await Resource.getAll(db)).forEach(r => { allCategories = allCategories.concat(r.category); });
        const categories = [ ...new Set(allCategories) ].sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : 1);

        // need separate list of resources with locations for map
        const resourceLocns = resources.filter(r => r.location != null).map(r => ({
            _id:  r._id,
            lat:  r.location.coordinates[1].toFixed(4),
            lon:  r.location.coordinates[0].toFixed(4),
            name: r.name,
        }));

        const filter = { category: ctx.request.query.category }; // current filter criteria
        const context = { resources, resourceLocns, categories, filter };
        await ctx.render('resources-list', context);
    }


    /**
     * GET /resources/edit - Render edit resource page.
     */
    static async edit(ctx) {
        const db = ctx.state.user.db;
        const resource = await Resource.get(db, ctx.params.id);

        resource.phone = resource.phone.join(', ');
        resource.email = resource.email.join(', ');
        resource.services = resource.services.join('; ');

        const context = Object.assign(resource, ctx.flash.formdata);
        await ctx.render('resources-edit', context);
    }


    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
    /* POST processing                                                                            */
    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


    /**
     * POST /resources/add - Process add resource.
     */
    static async processAdd(ctx) {
        const db = ctx.state.user.db;

        if (validationErrors(ctx.request.body, validation)) {
            ctx.flash = { validation: validationErrors(ctx.request.body, validation) };
            ctx.response.redirect(ctx.request.url); return;
        }

        const country = 'NG';  // TODO: derive country code from database

        // convert phones, e-mails, services to arrays
        ctx.request.body.phone = ctx.request.body.phone
            ? ctx.request.body.phone.split(',').map(num => formatPhone(num)).sort((a, b) => a < b ? -1 : 1)
            : [];
        ctx.request.body.email = ctx.request.body.email
            ? ctx.request.body.email.split(',').map(str => str.trim()).sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : 1)
            : [];
        ctx.request.body.services = ctx.request.body.services
            ? ctx.request.body.services.split(';').map(str => str.trim()).sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : 1)
            : [];

        // geocode address
        const location = ctx.request.body.address
            ? await Geocoder.geocode(ctx.request.body.address)
            : null;

        try {

            const id = await Resource.insert(db, ctx.request.body, location);
            ctx.response.set('X-Insert-Id', id); // for integration tests

            // return to list of resources
            ctx.response.redirect('/resources');

        } catch (e) {
            // stay on same page to report error (with current filled fields)
            ctx.flash = { formdata: ctx.request.body, _error: e.message };
            ctx.response.redirect(ctx.request.url);
        }

        function formatPhone(num) {
            return phoneUtil.format(phoneUtil.parse(num, country), PhoneNumberFormat.NATIONAL);
        }
    }


    /**
     * POST /resources/:resourcename/edit - Process edit resource.
     */
    static async processEdit(ctx) {
        const db = ctx.state.user.db;

        if (validationErrors(ctx.request.body, validation)) {
            ctx.flash = { validation: validationErrors(ctx.request.body, validation) };
            ctx.response.redirect(ctx.request.url); return;
        }

        const country = 'NG';  // TODO: derive country code from database

        // convert phones, e-mails, services to arrays
        ctx.request.body.phone = ctx.request.body.phone
            ? ctx.request.body.phone.split(',').map(num => formatPhone(num)).sort((a, b) => a < b ? -1 : 1)
            : [];
        ctx.request.body.email = ctx.request.body.email
            ? ctx.request.body.email.split(',').map(str => str.trim()).sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : 1)
            : [];
        ctx.request.body.services = ctx.request.body.services
            ? ctx.request.body.services.split(';').map(str => str.trim()).sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : 1)
            : [];

        // geocode address
        const location = ctx.request.body.address
            ? await Geocoder.geocode(ctx.request.body.address)
            : null;

        try {

            await Resource.update(db, ctx.params.id, ctx.request.body, location);

            // return to list of resources
            ctx.response.redirect('/resources');

        } catch (e) {
            // stay on current page to report error
            ctx.flash = { _error: e.message };
            ctx.response.redirect(ctx.request.url);
        }

        function formatPhone(num) {
            return phoneUtil.format(phoneUtil.parse(num, country), PhoneNumberFormat.NATIONAL);
        }
    }


    /**
     * POST /resources/:id/delete - Process delete resource.
     */
    static async processDelete(ctx) {
        const db = ctx.state.user.db;

        try {

            await Resource.delete(db, ctx.params.id);

            // return to list of resources
            ctx.response.redirect('/resources');

        } catch (e) {
            // stay on current page to report error
            ctx.flash = { _error: e.message };
            ctx.response.redirect(ctx.request.url);
        }
    }

}


/**
 * Format array of phone numbers for presentation in list of resources.
 *
 * Each number is wrapped in a nowrap div, with a class indicating validity.
 *
 * @param   {string[]} phoneNumbers - array of numbers as stored in database.
 * @param   {string}   country - ISO 3166-1 country code.
 * @returns {string}   HTML-formatted list of numbers.
 */
function formatPhoneNumbers(phoneNumbers, country) {
    const numbers = phoneNumbers.map(phone => {
        try {
            const num = phoneUtil.parse(phone, country);
            return phoneUtil.isValidNumber(num)
                ? `<div class="phone-valid nowrap">${phone}</div>`
                : `<div class="phone-invalid nowrap" title="invalid number?">${phone}</div>`;
        } catch (e) {
            return `<div class="phone-invalid" title="invalid number">${phone}</div>`;
        }
    });
    return numbers.join('');
}

/**
 * Format array of e-mails for presentation in list of resources.
 *
 * Each number is wrapped in a span, with a class indicating validity.
 *
 * @param   {string[]} emails - array of e-mails as stored in database.
 * @returns {string}   HTML-formatted list of e-mails.
 */
function formatEmails(emails) {
    const emailList = emails.map(email => {
        return isEmail.validate(email)
            ? `<span class="email-valid">${email}</span>`
            : `<span class="email-invalid" title="invalid email?">${email}</span>`;
    });
    return emailList.join(', ');
}

/**
 * Format url to be HTML <a> element, with protocol (if any) stripped from displayed text.
 *
 * Duplicated in app-report/<org>/<project>/handlers.js.
 *
 * @param   {string} url - Website URL.
 * @returns {string} HTML <a> element.
 */
function formatUrl(url) {
    if (!url) return '';
    const href = url.slice(0, 4)=='http' ? url : 'http://'+url;
    url = url.replace(/^https?:\/\//, '');
    return `<a href="${href}">${url}</a>`;
}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default Handlers;
