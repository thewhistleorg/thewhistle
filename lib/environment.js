/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Set environment for testing purposes.                                           C.Veness 2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


class Environment {

    /**
     * Set ctx.app.env to the environment persisted in ctx.session.origEnv - used in app.js.
     *
     * @param {Object} ctx - Koa context object.
     */
    static init(ctx) {
        if (ctx.session.origEnv) ctx.app.env = ctx.session.origEnv;
    }


    /**
     * Set application environment, to facilitate testing of functionality specific to particular
     * environments.
     *
     * This is saved in the session in order to persist between calls.
     *
     * @param {Object} ctx - Koa context object.
     */
    static set(ctx, env) {
        if (ctx.app.env != 'development' && ctx.session.origEnv != 'development') {
            throw new Error('Environment can only be reset in development');
        }

        if (![ 'development', 'staging', 'production' ].includes(env)) {
            throw new Error('Environment can only be dev/staging/production');
        }

        ctx.session.origEnv = ctx.app.env; // can only be 'development'!

        ctx.app.env = env;
    }

}

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default Environment;
