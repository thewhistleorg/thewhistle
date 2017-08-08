/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Users handlers - manage adding, editing, deleting users who have access to the app.            */
/*                                                                                                */
/* GET functions render template pages; POST functions process post requests then redirect.       */
/*                                                                                                */
/* Ajax functions set body & status, and should not throw (as that would  invoke the generic      */
/* admin exception handler which would return an html page).                                      */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const User   = require('../models/user.js');

class UsersHandlers {

    /**
     * GET /users/add - Render add user page.
     */
    static async add(ctx) {
        const availableDatabases = Object.keys(global.db).filter(db => db!='users');
        const context = Object.assign({ availableDatabases }, ctx.flash.formdata);
        await ctx.render('users-add', context);
    }

    /**
     * GET /users - Render list users page.
     */
    static async list(ctx) {
        const users = await User.getAll();
        users.sort((a, b) => { a = (a.firstname+a.lastname).toLowerCase(); b = (b.firstname+b.lastname).toLowerCase(); return a < b ? -1 : 1; });
        await ctx.render('users-list', { users });
    }

    /**
     * GET /users/edit - Render edit user page.
     */
    static async edit(ctx) {
        const user = await User.get(ctx.params.id);

        const availableDatabases = Object.keys(global.db).filter(db => db!='users');

        const context = Object.assign(user, { availableDatabases }, ctx.flash.formdata);
        await ctx.render('users-edit', context);
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

            // username must be
            if (!ctx.request.body.username.match(/[a-zA-Z-][a-zA-Z0-9-]*/)) throw new Error('Username must be alphanumeric');

            // ensure roles is array (koa-body will return single selection as string not array)
            if (!Array.isArray(ctx.request.body.roles)) {
                ctx.request.body.roles = ctx.request.body.roles ? [ctx.request.body.roles] : [];
            }
            // ensure databases is array (koa-body will return single selection as string not array)
            if (!Array.isArray(ctx.request.body.databases)) {
                ctx.request.body.databases = ctx.request.body.databases ? [ctx.request.body.databases] : [];
            }

            const id = await User.insert(ctx.request.body);
            ctx.set('X-Insert-Id', id); // for integration tests

            // return to list of users
            ctx.redirect('/users');

        } catch (e) {
            // stay on same page to report error (with current filled fields)
            console.error(e);
            ctx.flash = { formdata: ctx.request.body, _error: e.message };
            ctx.redirect(ctx.url);
        }

    }


    /**
     * POST /users/:username/edit - Process edit user.
     */
    static async processEdit(ctx) {
        if (!ctx.state.user.roles.includes('admin')) return ctx.redirect('/login'+ctx.url);

        try {

            // username must be
            if (!ctx.request.body.username.match(/[a-zA-Z-][a-zA-Z0-9-]*/)) throw new Error('Username must be alphanumeric');

            // ensure roles is array (koa-body will return single selection as string not array)
            if (!Array.isArray(ctx.request.body.roles)) {
                ctx.request.body.roles = ctx.request.body.roles ? [ctx.request.body.roles] : [];
            }
            // ensure databases is array (koa-body will return single selection as string not array)
            if (!Array.isArray(ctx.request.body.databases)) {
                ctx.request.body.databases = ctx.request.body.databases ? [ctx.request.body.databases] : [];
            }

            await User.update(ctx.params.id, ctx.request.body);

            // return to list of users
            ctx.redirect('/users');

        } catch (e) {
            // stay on current page to report error
            console.error(e);
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
            console.error(e);
            ctx.flash = { _error: e.message };
            ctx.redirect(ctx.url);
        }
    }

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

module.exports = UsersHandlers;
