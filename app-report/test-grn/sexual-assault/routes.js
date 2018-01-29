/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Routes: test-grn/sexual-assault.                                                C.Veness 2017  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import Router from 'koa-router'; // router middleware for koa
const router = new Router();

import handlers from './handlers.js';


router.get( '/:database/:project',            handlers.getIndex);
router.post('/:database/:project',            handlers.postPage);
router.get( '/:database/:project/:num(\\d+)', handlers.getPage);
router.post('/:database/:project/:num(\\d+)', handlers.postPage);
router.get( '/:database/:project/submit',     handlers.getSubmit);
router.post('/:database/:project/submit',     handlers.postSubmit);
router.get( '/:database/:project/whatnext',   handlers.getWhatnext);
router.post('/:database/:project/whatnext',   handlers.postWhatnext);
router.get( '/:database/:project/reset', function(ctx) { ctx.session.report = {}; ctx.redirect(`/${ctx.params.database}/${ctx.params.project}`); return;  }); // TODO; for testing only


// JUST FOR TESTING: supertest doesn't appear to manage to pass koa:jwt cookie between apps on
// different ports, so provide a way for the test suite to explicitly log in to the report app
import adminLogin from '../../../app-admin/login.js';
router.post('/:database/:project/login', adminLogin.postLogin);


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default router.middleware();
