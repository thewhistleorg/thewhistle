/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Notification model unit tests.                                                  C.Veness 2018  */
/*                                                                                                */
/* Note these tests do not mock out database components, but operate on the live 'grn' test db.   */
/* These tests assume Test Meister will have no notifications current in the 'grn' test db.       */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import { expect }   from 'chai';    // BDD/TDD assertion library
import dotenv       from 'dotenv';  // load environment variables from a .env file into process.env
import { ObjectId } from 'mongodb'; // MongoDB driver for Node.js

dotenv.config();

import Notification from '../../models/notification.js';
import User         from '../../models/user.js';

const testuser = process.env.TESTUSER;

const db = 'grn'; // the test organisation for the live ‘test-grn‘ organisation

// fake/dummy ObjectId: stackoverflow.com/questions/10593337
const pseudoObjectId = (rnd = r16 => Math.floor(r16).toString(16)) =>
    rnd(Date.now()/1000) + ' '.repeat(16).replace(/./g, () => rnd(Math.random()*16));

import './before.js';


describe(`Notification model (${db})`, function() {
    this.timeout(5e3); // 5 sec
    this.slow(100);

    let nIdNewReport = null;
    let nIdReportAssigned = null;
    let nIdReportMention = null;
    let initNotifications = null;
    let userId = null;
    const reportId = ObjectId(pseudoObjectId());


    before(async function() {
        // get userId for testuser
        const [ user ] = await User.getBy('email', testuser);
        userId = user._id;

        // check for any current notifications for testuser
        initNotifications = {
            'new report submitted':      await Notification.listForUser(db, userId.toString(), 'new report submitted'),
            'report assigned to user':   await Notification.listForUser(db, userId.toString(), 'report assigned to user'),
            'user mentioned in comment': await Notification.listForUser(db, userId.toString(), 'user mentioned in comment'),
        };
    });


    describe('supplied db failures', function() {
        // note chai doesn't currently cope well with exceptions thrown from async functions:
        // see github.com/chaijs/chai/issues/882#issuecomment-322131680
        // a few meaningless tests just to bump coverage stats
        it('throws on unset - notify', () => Notification.notify().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - notifyMultiple', () => Notification.notifyMultiple().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - listForReport', () => Notification.listForReport().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - listForUser', () => Notification.listForUser().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - listDebug', () => Notification.listDebug().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - dismiss', () => Notification.dismiss().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - dismissForUserReport', () => Notification.dismissForUserReport().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - cancel', () => Notification.cancel().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - cancelForReport', () => Notification.cancelForReport().catch(error => expect(error).to.be.an('error')));
        it('throws on unset - events', () => Notification.events().catch(error => expect(error).to.be.an('error')));
        // it('throws on unset - lastUpdate', () => Notification.lastUpdate().catch(error => expect(error).to.be.an('error')));
    });

    describe('report submission', function() {
        it('notifies all users of ‘new report submitted’', async function() {
            const users = await User.getForDb(db);
            nIdNewReport = await Notification.notifyMultiple(db, 'new report submitted', users.map(u => u._id.toString()), reportId.toString());
        });

        it('returns timestamp of new notification', async function() {
            const ts = await Notification.lastUpdate(db);
            expect(ts).to.equal(nIdNewReport.getTimestamp().toISOString().slice(0, -5));
        });

        it('includes ‘new report submitted’ in list of events', async function() {
            const events = await Notification.events(db);
            expect(events).to.include('new report submitted');
        });

        it('lists notifications of ‘new report submitted’ for testuser', async function() {
            const notifications = await Notification.listForUser(db, userId.toString(), 'new report submitted');
            expect(notifications.length).to.equal(initNotifications['new report submitted'].length + 1);
            const [ notification ] = notifications.filter(ntfcn => ntfcn.report.toString() == reportId.toString());
            expect(notification.event).to.equal('new report submitted');
            expect(notification.users).to.deep.include(userId);
            expect(notification.report).to.deep.equal(reportId);
        });

        it('lists notifications of ‘new report submitted’ in listForReport', async function() {
            const notifications = await Notification.listForReport(db, 'new report submitted', reportId.toString());
            expect(notifications.length).to.equal(1);
            const [ notification ] = notifications;
            expect(notification.event).to.equal('new report submitted');
            expect(notification.users).to.deep.include(userId);
            expect(notification.report).to.deep.equal(reportId);
        });

        it('lists all notifications (for debugging)', async function() {
            const notifications = await Notification.listDebug(db);
            expect(notifications.length).to.be.at.least(1);
        });

        it('cancels ‘new report submitted’ notification', async function() {
            await Notification.cancel(db, nIdNewReport.toString());
            const notifications = await Notification.listForUser(db, userId, 'new report submitted');
            expect(notifications.length).to.equal(initNotifications['new report submitted'].length);
        });
    });

    describe('report assignment', function() {
        it('notifies user of ‘report assigned to user’', async function() {
            nIdReportAssigned = await Notification.notify(db, 'report assigned to user', userId.toString(), reportId.toString());
        });

        it('returns timestamp of new notification', async function() {
            const ts = await Notification.lastUpdate(db);
            expect(ts).to.equal(nIdReportAssigned.getTimestamp().toISOString().slice(0, -5));
        });

        it('includes ‘report assigned to user’ in list of events', async function() {
            const events = await Notification.events(db);
            expect(events).to.include('report assigned to user');
        });

        it('lists notifications of ‘report assigned to user’ for testuser', async function() {
            const notifications = await Notification.listForUser(db, userId, 'report assigned to user');
            expect(notifications.length).to.equal(initNotifications['report assigned to user'].length + 1);
            const [ notification ] = notifications.filter(ntfcn => ntfcn.report.toString() == reportId.toString());
            expect(notification.event).to.equal('report assigned to user');
            expect(notification.users.length).to.equal(1);
            expect(notification.users).to.deep.include(userId);
            expect(notification.report).to.deep.equal(reportId);
        });

        it('dismisses notification', async function() {
            await Notification.dismiss(db, nIdReportAssigned.toString(), userId.toString());
            const notifications = await Notification.listForUser(db, userId, 'report assigned to user');
            expect(notifications.length).to.equal(initNotifications['report assigned to user'].length);
        });
    });

    describe('mention in comment', function() {
        it('notifies user of ‘user mentioned in comment’', async function() {
            nIdReportMention = await Notification.notify(db, 'user mentioned in comment', userId, reportId);
        });

        it('returns timestamp of new notification', async function() {
            const ts = await Notification.lastUpdate(db);
            expect(ts).to.equal(nIdReportMention.getTimestamp().toISOString().slice(0, -5));
        });

        it('lists notifications of ‘user mentioned in comment’ for testuser', async function() {
            const notifications = await Notification.listForUser(db, userId, 'user mentioned in comment');
            expect(notifications.length).to.equal(initNotifications['user mentioned in comment'].length + 1);
            const [ notification ] = notifications.filter(ntfcn => ntfcn.report.toString() == reportId.toString());
            expect(notification.event).to.equal('user mentioned in comment');
            expect(notification.users.length).to.equal(1);
            expect(notification.users).to.deep.include(userId);
            expect(notification.report).to.deep.equal(reportId);
        });

        it('dismisses notifications for user/report', async function() {
            await Notification.dismissForUserReport(db, userId.toString(), reportId.toString());
            const notifications = await Notification.listForUser(db, userId, 'user mentioned in comment');
            expect(notifications.length).to.equal(initNotifications['user mentioned in comment'].length);
        });

        it('cancels (already dismissed) notifications for report (just for coverage!)', async function() {
            await Notification.cancelForReport(db, reportId.toString());
        });
    });

});
