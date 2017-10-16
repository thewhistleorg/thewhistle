/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Routes for bunyan logs.                                                         C.Veness 2017  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import Router       from 'koa-router';            // router middleware for koa
import childProcess from 'child-process-promise'; // promises wrapper around child_process
import path         from 'path';                  // nodejs.org/api/path.html
const router = new Router();
const spawn  = childProcess.spawn;

// logs - quick'n'dirty visibility of bunyan logs
router.get('/logs/:logfile', async function logs(ctx) {
    if (!ctx.state.user.roles.includes('su')) return ctx.redirect('/login'+ctx.url);

    const bunyan = require.resolve('bunyan/bin/bunyan'); // full path to bunyan command
    const logfile = path.join(__dirname, '../logs/'+ctx.params.logfile);
    const args = ctx.query.options ? [ logfile, ctx.query.options ] : [ logfile ];

    try {

        const proc = await spawn(bunyan, [ args ], { capture: [ 'stdout', 'stderr' ] });

        await ctx.render('logs', { bunyan: proc.stdout, logfile: ctx.params.logfile });

    } catch (e) {
        // log file not found?
        await ctx.render('logs', { bunyan: `Log file ${ctx.params.logfile} not found`, logfile: ctx.params.logfile });
    }

});


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default router.middleware();
