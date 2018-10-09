/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Groups handlers for the admin app                                            Louis Slater 2018 */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


import Group  from '../models/group.js';
import User   from '../models/user.js';


import { ObjectId } from 'mongodb';      // MongoDB driver for Node.js


class GroupHandlers {


    static async callAdminFunction(ctx, fn) {
        if (!ctx.state.user.roles.includes('admin')) {
            ctx.flash = { _error: 'User management requires admin privileges' };
            ctx.response.redirect('/login'+ctx.request.url);
        } else {
            await fn(ctx);
        }
    }


    static async getGroupsPage(ctx) {
        await GroupHandlers.callAdminFunction(ctx, async function () {
            const db = ctx.state.user.db;
            const groups = await Group.getAll(db);
            for (let i = 0; i < groups.length; i++) {
                groups[i].leaders = await User.getGroupLeaders(groups[i]._id);
            }
            await ctx.render('groups', { groups: groups });
        });
    }


    static async getCreateGroupPage(ctx) {
        await GroupHandlers.callAdminFunction(ctx, async function () {
            await ctx.render('create-group');
        });
    }


    static async postCreateGroup(ctx) {
        await GroupHandlers.callAdminFunction(ctx, async function () {
            if (ctx.request.body.name) {
                try {
                    await Group.create(ctx.state.user.db, ctx.request.body.name);
                    ctx.response.redirect('/groups');
                } catch (e) {
                    ctx.flash = { _error: 'Could not create group' };
                    ctx.response.redirect('/create-group');
                }
            } else {
                ctx.flash = { _error: 'A group requires a name' };
                ctx.response.redirect('/create-group');
            }
            
        });
    }


    static async postDeleteGroup(ctx) {
        await GroupHandlers.callAdminFunction(ctx, async function() {
            try {
                await Group.delete(ctx.state.user.db, new ObjectId(ctx.params.group));
                ctx.status = 200;
            } catch (e) {
                ctx.status = e.status ? e.status : 500;
                ctx.flash = { _error: 'Error: Could not delete group.' };
            }
        });
    }


}


export default GroupHandlers;
