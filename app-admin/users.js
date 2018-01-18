/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Users handlers - manage adding, editing, deleting users who have access to the app.            */
/*                                                                                 C.Veness 2017  */
/*                                                                                                */
/* GET functions render template pages; POST functions process post requests then redirect.       */
/*                                                                                                */
/* Ajax functions set body & status, and should not throw (as that would  invoke the generic      */
/* admin exception handler which would return an html page).                                      */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import dateFormat from 'dateformat'; // Steven Levithan's dateFormat()

import User   from '../models/user.js';
import Report from '../models/report.js';

/*
 * Note on roles:
 *  - reporter: for paralegals who can log in to use the admin single-page reporting function, but
 *              have access to no other parts of the admin system
 *  - user:     regular NGO admin system user
 *  - admin:    NGO administrator user with rights to manage users and resources
 *  - su:       user who can view & manage users from all organisations
 */

class UsersHandlers {

    /**
     * GET /users/add - Render add user page.
     */
    static async add(ctx) {
        const isAdminUser = ctx.state.user.roles.includes('admin');
        if (!isAdminUser) {
            ctx.flash = { _error: 'User management requires admin privileges' };
            ctx.redirect('/login');
        }

        const isSuUser = ctx.state.user.roles.includes('su') ? 'show' : 'hide';
        const context = {
            isSuUser:           isSuUser,             // su can view users from all organisations, and set org access
            availableDatabases: availableDatabases(), // su can set which organisations use can access
            databases:          ctx.state.user.db,    // make current user's organisation checked by default
        };

        await ctx.render('users-add', Object.assign(context, ctx.flash.formdata));
    }


    /**
     * GET /users - Render list users page.
     *
     * If user has su role, all users are listed; otherwise, only users with access to current
     * user's database.
     */
    static async list(ctx) {
        const isAdminUser = ctx.state.user.roles.includes('admin');
        if (!isAdminUser) {
            ctx.flash = { _error: 'User management requires admin privileges' };
            ctx.redirect('/login');
        }

        const isSuUser = ctx.state.user.roles.includes('su') ? 'show' : 'hide';

        const users = (await User.getAll()).filter(usr => isSuUser=='show' || usr.databases.includes(ctx.state.user.db));

        users.sort((a, b) => { a = (a.firstname+a.lastname).toLowerCase(); b = (b.firstname+b.lastname).toLowerCase(); return a < b ? -1 : 1; });
        await ctx.render('users-list', { users, isSuUser: isSuUser });
    }


    /**
     * GET /users/:id/edit - Render edit user page.
     */
    static async edit(ctx) {
        const isAdminUser = ctx.state.user.roles.includes('admin');
        if (!isAdminUser) {
            ctx.flash = { _error: 'User management requires admin privileges' };
            ctx.redirect('/login');
        }

        if (!ctx.params.id.match(/^[0-9a-f]{24}$/i)) ctx.throw(404, 'User not found');

        const user = await User.get(ctx.params.id);

        if (!user) ctx.throw(404, 'User not found');

        const isSuUser = ctx.state.user.roles.includes('su') ? 'show' : 'hide';
        const context = {
            isSuUser:           isSuUser,             // su can view users from all organisations, and set org access
            availableDatabases: availableDatabases(), // su can set which organisations use can access
        };

        await ctx.render('users-edit', Object.assign(user, context, ctx.flash.formdata));
    }


    /**
     * GET /users/:id - Render view user details page (based on either user-id or user-name).
     *
     * This may or may not in time be superseded by the user's home/dashboard page, but in the
     * meantime serves as a summary of user details, and a destination from the @mentions in
     * comments.
     */
    static async view(ctx) {
        const db = ctx.state.user.db;

        let user = null;

        if (ctx.params.id.match(/^[0-9a-f]{24}$/i)) {
            user = await User.get(ctx.params.id);
        }

        if (!user) {
            // try getting user by username instead of id
            [ user ] = await User.getBy('username', ctx.params.id);
        }

        if (!user) ctx.throw(404, 'User not found');

        const reports = await Report.find(db, { assignedTo: user._id, archived: false });

        for (const report of reports) {
            report.reportedOn = dateFormat(report._id.getTimestamp(), 'd mmm yyyy HH:MM');
            report.reportedThrough = report.by ? (await User.get(report.by)).username : '';
            const desc = report.submitted.Description || '';
            report.desc = desc.length>36 ? desc.slice(0, 36)+'…' : desc;
        }

        reports.sort((a, b) => a._id > b._id); // sort by date submitted ascending

        const context = Object.assign({}, user, {
            db:      db,
            reports: reports,
        });
        await ctx.render('users-view', context);
    }


    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
    /* POST processing                                                                            */
    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


    /**
     * POST /users/add - Process add user.
     */
    static async processAdd(ctx) {
        //if (ctx.state.user.Role != 'admin') return ctx.redirect('/login'+ctx.url);

        try {

            // username must be alphanumeric
            if (!ctx.request.body.username.match(/[a-zA-Z-][a-zA-Z0-9-]*/)) throw new Error('Username must be alphanumeric');

            // ensure roles is array (koa-body will return single selection as string not array)
            if (!Array.isArray(ctx.request.body.roles)) {
                ctx.request.body.roles = ctx.request.body.roles ? [ ctx.request.body.roles ] : [];
            }
            // ensure databases is array (koa-body will return single selection as string not array)
            if (!Array.isArray(ctx.request.body.databases)) {
                ctx.request.body.databases = ctx.request.body.databases ? [ ctx.request.body.databases ] : [];
            }

            // ensure su is also admin
            if (ctx.request.body.roles.includes('su') && !ctx.request.body.roles.includes('admin')) {
                ctx.request.body.roles.concat([ 'admin' ], ctx.request.body.roles); // put 'admin' at the front!
            }

            const id = await User.insert(ctx.request.body);
            ctx.set('X-Insert-Id', id); // for integration tests

            // return to list of users
            ctx.redirect('/users');

        } catch (e) {
            // stay on same page to report error (with current filled fields)
            ctx.flash = { formdata: ctx.request.body, _error: e.message };
            ctx.redirect(ctx.url);
        }

    }


    /**
     * POST /users/:username/edit - Process edit user.
     *
     * TODO: server-side validation - only admin user should be able to change admin status, but
     *       needs thought as to implementation
     */
    static async processEdit(ctx) {
        if (!ctx.state.user.roles.includes('admin')) return ctx.redirect('/login'+ctx.url);

        try {

            // username must be
            if (!ctx.request.body.username.match(/[a-zA-Z-][a-zA-Z0-9-]*/)) throw new Error('Username must be alphanumeric');

            // ensure roles is array (koa-body will return single selection as string not array)
            if (!Array.isArray(ctx.request.body.roles)) {
                ctx.request.body.roles = ctx.request.body.roles ? [ ctx.request.body.roles ] : [];
            }
            // ensure databases is array (koa-body will return single selection as string not array)
            if (!Array.isArray(ctx.request.body.databases)) {
                ctx.request.body.databases = ctx.request.body.databases ? [ ctx.request.body.databases ] : [];
            }

            // ensure su is also admin
            if (ctx.request.body.roles.includes('su') && !ctx.request.body.roles.includes('admin')) {
                ctx.request.body.roles.concat([ 'admin' ], ctx.request.body.roles); // put 'admin' at the front!
            }

            await User.update(ctx.params.id, ctx.request.body);

            // TODO: if roles/organisations changed for current user, need to reset ctx.state

            // return to list of users
            ctx.redirect('/users');

        } catch (e) {
            // stay on current page to report error
            ctx.flash = { _error: e.message };
            ctx.redirect(ctx.url);
        }
    }


    /**
     * POST /users/:id/delete - Process archive/delete user (flag as archived if referenced,
     * otherwise delete).
     */
    static async processDelete(ctx) {
        if (!ctx.state.user.roles.includes('admin')) return ctx.redirect('/login'+ctx.url);

        try {

            // TODO: archive if referenced
            await User.delete(ctx.params.id);

            // return to list of users
            ctx.redirect('/users');

        } catch (e) {
            // stay on current page to report error
            ctx.flash = { _error: e.message };
            ctx.redirect(ctx.url);
        }
    }


    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
    /* Ajax functions                                                                             */
    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


    /**
     * Make user details available; for now, this is just for testing.
     *
     * eg /ajax/users?email=test@thewhistle.org
     */
    static async ajaxUserDetails(ctx) {
        if (Object.keys(ctx.request.query).length == 0) { ctx.status = 403; ctx.body = {}; return; }

        const fld = Object.keys(ctx.request.query)[0];
        const val = ctx.request.query[fld];

        try {
            const users = await User.getBy(fld, val);
            if (users.length == 0) { ctx.status = 404; ctx.body = {}; return; }
            const usrsNoPw = users.map(u => { delete u.password; return u; }); // no need to show p/w, even encrypted!
            ctx.status = 200;
            ctx.body = { users: usrsNoPw };
        } catch (e) {
            ctx.status = 500;
            ctx.body = e;
        }
        ctx.body.root = 'reports';
    }
}


/**
 * Determine list of available organisation databases by looking for environment variables starting
 * with 'DB_'.
 *
 * @returns {string[]} List of defined organisation databases.
 */
function availableDatabases() {
    const dbEnvVars = Object.keys(process.env).filter(envvar => envvar.slice(0,3)=='DB_');
    const databases = dbEnvVars.map(db => db.slice(3).toLowerCase().replace('_', '-'));
    return databases.filter(db => db!='users').sort();
}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


/**
 * Add apostrophe-s or plain apostrophe as appropriate to make possessive of name
 * (e.g. John => John’s, Alexis => Alexis’). Perhaps not enough examples to be worth the complication.
function possessive(name) {
    // if no trailing s, append apostrophe-s
    if (name.slice(-1) != 's') return '’s';

    // for name ending with two sibilant sounds, just append apostrophe
    if (name.match(/[sx][aeiou]+s$/)) return '’';
    if (name.match(/c[ei][aeiou]*s$/)) return '’';
    if (name.match(/sh[aeiou]+s$/)) return '’';

    // otherwise append default apostrophe-s
    return '’s';
}
*/

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default UsersHandlers;
