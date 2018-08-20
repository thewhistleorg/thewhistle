/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Set environment for testing purposes.                                           C.Veness 2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


class Environment {


    /** Set application environment, to facilitate testing of functionality specific to particular
     * environments.
     *
     * Note this sets the entire application environment, not just for the current request context,
     * so would be dangerous in a context where multiple users are making requests! In particular,
     * it must never be possible to set the production environment to development.
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
        ctx.session.env = env;
        ctx.app.env = env;
    }


    /**
     * Return current application environment.
     *
     * @param {Object} ctx - Koa context object.
     */
    static get(ctx) {
        return ctx.app.env;
    }

}

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default Environment;
