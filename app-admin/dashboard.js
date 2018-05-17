/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Dashboard handlers - user & general dashboards.                            C.Veness 2017-2018  */
/*                                                                                                */
/* GET functions render template pages; POST functions process post requests then redirect.       */
/*                                                                                                */
/* Ajax functions set body & status, and should not throw (as that would  invoke the generic      */
/* admin exception handler which would return an html page).                                      */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import { ObjectId } from 'mongodb';    // MongoDB driver for Node.js
import dateFormat   from 'dateformat'; // Steven Levithan's dateFormat()

import User   from '../models/user.js';
import Report from '../models/report.js';
import Update from '../models/update.js';


class DashboardHandlers {

    /**
     * GET /dashboard/:username - Render user's dashboard page.
     */
    static async user(ctx) {
        const db = ctx.state.user.db;

        // user details
        const [ user ] = await User.getBy('username', ctx.params.username);
        if (!user) ctx.throw(404, 'User not found');

        // all user details (for user names)
        const users = await User.details(); // note users is a Map

        const filterActive = { archived: false };

        // reports assigned to user
        const filterUser = { $and: [ filterActive, { assignedTo: ObjectId(user._id) } ] };
        const reportsUser = await Report.find(db, filterUser);

        // supplementary info
        for (const report of reportsUser) {
            report.reported = report._id.getTimestamp();
            report.reportedFull = dateFormat(report.reported, 'ddd d mmm yyyy HH:MM');
            report.reportedPretty = prettyDate(report.reported);
            report.lastViewed = report.views[user._id];
            report.lastViewedOn = report.lastViewed ? report.lastViewed.toISOString() : '';
            report.lastViewedFull = report.lastViewed ? dateFormat(report.lastViewed, 'ddd d mmm yyyy HH:MM') : '';
            report.lastViewedPretty = report.lastViewed ? prettyDate(report.lastViewed) : '—';
            report.assignedTo = report.assignedTo ? '@'+users.get(report.assignedTo.toString()).username : '—';
        }

        // check when most recently assigned to this user
        for (const report of reportsUser) {
            const rptUpdates = await Update.getByReport(db, report._id);
            const rptAssigns =  rptUpdates.filter(u => u.update.set && u.update.set.assignedTo && u.update.set.assignedTo.toString() == user._id.toString());
            const assignedDates = rptAssigns.map(u => u.on);
            report.assigned = assignedDates.length>0 ? new Date(Math.max(...assignedDates)) : new Date(); // in case assigned to user multiple times (or no record of assign)
        }
        // reports newly assigned to user
        const reportsNewlyAssigned = reportsUser.filter(r => r.lastViewed == undefined || r.assigned > r.lastViewed);

        // tags in reports assigned to user
        const t = new Set();
        for (const report of reportsUser) {
            if (!report.archived) {
                for (const tag of report.tags) t.add(tag);
            }
        }
        const tags = [ ...t ].map(tag => ({ tag: tag, tagHref: encodeURIComponent(tag).replace('%20', '+') }));

        // recent activity
        const updates = await Update.getByUser(db, user._id, 12);
        for (const update of updates) {
            if (update.report == null) continue; // just in case report is deleted
            update.updatedOn = update.on.toISOString();
            update.updatedAgo = ago(update.on);
            update.updatedFull = dateFormat(update.on, 'ddd d mmm yyyy HH:MM');
            update.report.reported = update.report._id.getTimestamp();
            update.report.reportedFull = dateFormat(update.report.reported, 'ddd d mmm yyyy HH:MM');
            update.report.reportedPretty = prettyDate(update.report.reported);
            update.report.reportedBy = update.report.by ? (await User.get(update.report.by)).username : '';
            update.report.assignedTo = update.report.assignedTo ? '@'+users.get(update.report.assignedTo.toString()).username : '—';
        }

        // comments mentioning user
        //const commentaries = await Report.getByElemMatch('comments', 'comment', new RegExp('@'+user.username));
        const filterReferencingUser = { $and: [ filterActive, { 'comments.comment': new RegExp('@'+user.username) } ] };
        const reportsReferencingUser = await Report.find(db, filterReferencingUser);
        for (const report of reportsReferencingUser) {
            report.reported = report._id.getTimestamp();
            report.reportedFull = dateFormat(report.reported, 'ddd d mmm yyyy HH:MM');
            report.reportedPretty = prettyDate(report.reported);
            report.reportedBy = report.by ? (await User.get(report.by)).username : '';
            // check for 'newly mentioned' TODO: still required?
            // const lastViewed = await Report.lastViewed(db, report._id, ctx.state.user.id);
            // const reportUpdates = await Update.getByReport(db, report._id);
            // const mentionedDates = reportUpdates.filter(u => u.update.push && u.update.push.comments && u.update.push.comments.match(new RegExp('@'+user.username))).map(u => u.on);
            // const mentionedOn = new Date(Math.max(...mentionedDates)); // in case mentioned multiple times
        }

        // most recently viewed reports
        const filterRecentlyViewed = { ['views.'+user._id]: { '$exists': true } }; // TODO: remove .toArray from .find()
        const recentlyViewed = await global.db[db].collection('reports').find(filterRecentlyViewed).sort({ ['views.'+user._id]: -1 }).limit(6).toArray();
        for (const report of recentlyViewed) {
            report.viewedOn = report.views[user._id].toISOString();
            report.viewedAgo = ago(report.views[user._id]);
            report.viewedFull = dateFormat(report.views[user._id], 'ddd d mmm yyyy HH:MM');
            report.reported = report._id.getTimestamp();
            report.reportedFull = dateFormat(report.reported, 'ddd d mmm yyyy HH:MM');
            report.reportedPretty = prettyDate(report.reported);
            report.assignedTo = report.assignedTo ? '@'+users.get(report.assignedTo.toString()).username : '—';
        }

        // timestamp of most recently submitted report (for auto-refresh)
        const latest = await Report.getLatestTimestamp(db);

        const context = Object.assign(user, {
            reportsNewlyAssigned:   reportsNewlyAssigned,
            recentlyViewed:         recentlyViewed,
            tags:                   [ ...tags ],
            reportsReferencingUser: reportsReferencingUser,
            reportsUser:            reportsUser,
            updates:                updates,
            latest:                 latest,
        });

        await ctx.render('dashboard-user', context);
    }


    /**
     * GET /dashboard - Render general dashboard page.
     */
    static async general(ctx) {
        const db = ctx.state.user.db;

        // current user details (for user activity tab)
        const [ user ] = await User.getBy('username', ctx.state.user.name);
        if (!user) ctx.throw(404, 'User not found');

        const filterActive = { archived: false };

        // unassigned reports
        const filterUnassigned = { $and: [ filterActive, { assignedTo: null } ] };
        const reportsUnassigned = await Report.find(db, filterUnassigned);
        for (const report of reportsUnassigned) {
            report.reported = dateFormat(report._id.getTimestamp(), 'yyyy-mm-dd HH:MM');
            report.reportedFull = dateFormat(report.reported, 'ddd d mmm yyyy HH:MM');
            report.reportedPretty = prettyDate(report.reported);
            report.reportedBy = report.by ? '@'+(await User.get(report.by)).username : '—';
        }
        reportsUnassigned.sort((a, b) => a._id < b._id ? -1 : 1); // sort in chronological order

        // recent activity
        const users = await User.details(); // note users is a Map
        const updates = await Update.getAll(db, 24);
        for (const update of updates) {
            if (update.report == null) continue; // just in case report is deleted
            update.updatedAgo = ago(update.on);
            update.updatedFull = dateFormat(update.on, 'ddd d mmm yyyy HH:MM');
            update.report.reported = dateFormat(update.report._id.getTimestamp(), 'yyyy-mm-dd HH:MM');
            update.report.reportedFull = dateFormat(update.report.reported, 'ddd d mmm yyyy HH:MM');
            update.report.reportedPretty = prettyDate(update.report.reported);
            update.report.reportedBy = update.report.by ? (await User.get(update.report.by)).username : '';
            update.report.assignedTo = update.report.assignedTo ? '@'+users.get(update.report.assignedTo.toString()).username : '—';
        }

        // timestamp of most recently submitted report (for auto-refresh)
        const latest = await Report.getLatestTimestamp(db);

        const context = Object.assign(user, {
            reportsUnassigned: reportsUnassigned.sort((a, b) => a.reportedOn < b.reportedOn ? -1 : 1),
            updates:           updates,
            latest:            latest,
        });

        await ctx.render('dashboard-general', context);
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


/**
 * Format supplied date as hh:mm if it is today, or d mmm yyyy otherwise.
 *
 * @param {Date} date - Date to be formatted.
 * @returns {string} Formatted date.
 *
 * TODO: timezone?
 */
function prettyDate(date) {
    // use appropriate date format for today, this year, older
    let format = 'd mmm yyyy';                                                             // before this year
    if (new Date(date).getFullYear() == new Date().getFullYear()) format = 'd mmm 	 	 	 ';   // this year
    if (new Date(date).toDateString() == new Date().toDateString()) format = 'HH:MM 	 	 	 '; // today
    return dateFormat(date, format);
}


/**
 * Converts date to period-ago relative to now (approximates months and years).
 *
 * @param {Date|string} date - Date interval is to be given for.
 * @param {boolean}     short - Short format (just 1st letter of period).
 * @returns {string} Description of interval between date and now.
 */
function ago(date, short=false) {
    const duration = {
        year:  1000 * 60 * 60 * 24 * 365,
        month: 1000 * 60 * 60 * 24 * 30,
        week:  1000 * 60 * 60 * 24 * 7,
        day:   1000 * 60 * 60 * 24,
        hour:  1000 * 60 * 60,
        min:   1000 * 60,
        sec:   1000,
    };

    const interval = Date.now() - new Date(date).valueOf();

    for (const period in duration) {
        if (interval > duration[period]) {
            const n = Math.floor(interval / (duration[period]));
            return short ? n + period.slice(0, 1) : n + ' ' + period + (n>1 ? 's' : '') + ' ago';
        }
    }

    return 'now';
}


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

export default DashboardHandlers;
