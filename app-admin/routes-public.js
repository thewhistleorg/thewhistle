/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Public routes (available with no login.                                         C.Veness 2017  */
/*                                                                                                */
/*                                       © 2017 Cambridge University / The Whistle | MIT licence  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

/* eslint space-in-parens: off */

import Router from 'koa-router'; // router middleware for koa

const router = new Router();


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Route to handle '/' root element                                                              */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

router.get('/', function getIndexPage(ctx) {
    // if user logged in, redirect to user's home page
    //if (ctx.state.user) return ctx.response.redirect('/dashboard/'+ctx.state.user.name);
    // for the moment, we will redirect to the list of reports, as user's home page dashboard is not ready
    if (ctx.state.user) return ctx.response.redirect('/reports');

    // otherwise render index page
    // suspended 9 Feb 2018: await ctx.render('index');

    // otherwise (temporarily?) redirect to login page (per decision 9 Feb 2018)
    return ctx.response.redirect('/login');
});


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Login routes                                                                                  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import login from './login.js';

// note url allowed after '/login' to redirect to after successful login
router.get(/^\/login(.*)/,  login.getLogin);    // render login page
router.get('/logout',       login.getLogout);   // log user out

router.post(/^\/login(.*)/, login.postLogin);   // process login

// ---- ajax routes

router.get('/ajax/login/databases', login.getUserDatabases); // get databases user has access to


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Password reset routes                                                                         */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import passwordReset from './password-reset.js';

router.get( '/password/reset-request',         passwordReset.request);        // render request password page
router.post('/password/reset-request',         passwordReset.processRequest); // send password reset e-mail
router.get( '/password/reset-request-confirm', passwordReset.requestConfirm); // render request confirmation page
router.get( '/password/reset/confirm',         passwordReset.resetConfirm);   // render password reset confirmation page
router.get( '/password/reset/:token',          passwordReset.reset);          // render password reset page
router.post('/password/reset/:token',          passwordReset.processReset);   // process password reset


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default router.middleware();
