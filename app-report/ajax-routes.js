/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Routing for ajax calls.                                                         C.Veness 2017  */
/*                                                                                                */
/* This holds app-specific ajax calls (none specified in this sample app), and passes through     */
/* other generic requests to the API.                                                             */
/*                                                                                                */
/* Being placed after auth test in the middleware stack, ajax calls are password-protected.       */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const router = require('koa-router')(); // router middleware for koa

const ajax = require('./ajax-handlers.js');


/*
 * App-specific ajax routes go here
 */
router.get( '/ajax/:db/names/new', ajax.getGenerateNewName); // note means 'new' cannot be used as a name
router.get( '/ajax/:db/names/:id', ajax.getName);            // currently just used to verify if name exists


/*
 * Return 404 for anything unrecognised
 */
router.all(/\/ajax\/(.*)/, ajax.ajax404);


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = router.middleware();
