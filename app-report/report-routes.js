/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Routing for incident submission report pages.                                   C.Veness 2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

/* eslint space-in-parens: off */

import Router from 'koa-router'; // router middleware for koa
const router = new Router();

import handlers from './report-handlers.js';


// JUST FOR TESTING: supertest doesn't appear to manage to pass koa:jwt cookie between apps on
// different ports, so provide a way for the test suite to explicitly log in to the report app
import adminLogin from '../app-admin/login.js';
router.post('/:database/:project/login', adminLogin.postLogin);

// redirect /test-grn/sexual-assault to /grn/rape-is-a-crime; GRN launched /test-grn/sexual-assault
// as the reporting URL, but this has now been corrected to /grn/rape-is-a-crime
router.get( '/test-grn/sexual-assault', ctx => ctx.response.redirect('/grn/rape-is-a-crime'));

router.get( '/',                           handlers.getHomePage);   // home page

//Serve SMS test web app

router.get( '/:database/:project/rebuild', handlers.rebuild);       // rebuild report from spec
router.get( '/:database/:project',         handlers.getIndex);      // render incident report index page
router.post('/:database/:project',         handlers.postIndex);     // process index page submission
router.get( '/:database/:project/:page',   handlers.getPage);       // render report page
router.post('/:database/:project/:page',   handlers.postPage);      // process page submission

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default router.middleware();
