/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Ajax handlers (invoked by router to return JSON data)                                          */
/*                                                                                                */
/* All functions here should set body, and status if not 200, and should not throw (as that would */
/* invoke the generic admin exception handler which would return an html page).                   */
/*                                                                                                */
/* Generic ajax functionality gets passed through to be handled by the API via the                */
/* ajaxApiPassthrough() function.                                                                 */
/*                                                                                                */
/* Being placed after auth test in the middleware stack, ajax calls are password-protected.       */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const Report   = require('../models/report.js');
const generate = require('../lib/adjective-animal.js');

const handler = {};


/**
 * Generate a random adjective-noun name.
 */
handler.getGenerateNewName = async function(ctx) {
    let name = null;
    do {
        name = await generate(12);
    } while (name.length > 12); // avoid excessively long names
    ctx.body = { name: name };
    ctx.body.root = 'generateName';
    ctx.status = 200; // Ok
    ctx.set('Cache-Control', 'no-cache'); // stop IE cacheing generated names.
};


/**
 * Get details of name - currently just used to check if name is available.
 *
 * TODO: generalise from GRN reports [by making top-level 'name' mandatory?]
 */
handler.getName = async function(ctx) {
    const db = ctx.params.db;
    const reports = await Report.getBy(db, 'report.identifier-name', ctx.params.id);
    ctx.body = {};
    ctx.body.root = 'name';
    ctx.status = reports.length==0 && ctx.params.id!='' ? 404 : 200; // Not Found / Ok
};


/*
 * 404 Not Found.
 */
handler.ajax404 = function(ctx) {
    ctx.body = { message: 'Not Found' };
    ctx.body.root = 'error';
    ctx.status = 404; // Not Found
};


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = handler;
