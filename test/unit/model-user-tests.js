/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* User model unit tests.                                                     C.Veness 2017-2018  */
/*                                                                                                */
/* Note these tests do not mock out database components, but operate on the live 'user' db.       */
/*                                                                                                */
/*                                  © 2017-2018 Cambridge University / The Whistle | MIT licence  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import { expect } from 'chai';   // BDD/TDD assertion library
import dotenv     from 'dotenv'; // load environment variables from a .env file into process.env

dotenv.config();

import User from '../../models/user.js';

import './before.js';

describe('User model', function() {
    let userId = null;

    const values = {
        firstname: 'test',
        lastname:  'user',
        email:     'test@user.com',
        password:  null,
        username:  'test',
        roles:     [ 'user' ],
        databases: [ 'test' ],
    };

    it('creates user', async function() {
        userId = await User.insert(values);
        console.info('\tuser id', userId);
    });

    it('fails to create duplicate user', async function() {
        try {
            await User.insert(values);
            throw new Error('User.insert should fail validation');
        } catch (e) {
            expect(e.message).to.equal('email/username ‘test@user.com’ already in use');
        }
    });

    it('gets user', async function() {
        const user = await User.get(userId);
        expect(user).to.be.an('object');
        expect(user.username).to.equal('test');
    });

    it('gets user using string id', async function() {
        const user = await User.get(userId.toString());
        expect(user).to.be.an('object');
        expect(user.username).to.equal('test');
    });

    it('gets all users', async function() {
        const users = await User.getAll(userId);
        expect(users).to.be.an('array');
        expect(users).to.have.lengthOf.at.least(1);
    });

    it('gets user by value', async function() {
        const users = await User.getBy('username', 'test');
        expect(users).to.be.an('array');
        expect(users).to.have.lengthOf.at.least(1);
    });

    it('updates user', async function() {
        await User.update(userId, { username: 'test2' });
        const user = await User.get(userId);
        expect(user).to.be.an('object');
        expect(user.username).to.equal('test2');
        await User.update(userId, { username: 'test' }); // set it back
    });

    it('gets map of all users', async function() {
        const users = await User.details();
        expect(users).to.be.a('map');
        expect(users.get(userId.toString()).username).to.equal('test');
    });

    it('gets list all users', async function() {
        const users = await User.names();
        expect(users).to.be.a('map');
        expect(users.get(userId.toString())).to.equal('test');
    });

    it('fails to set no-such-field', async function() {
        const vals = { ...values, username: 'validn-test', email: 'validn@test', 'no-such-field': 'nothing here' };
        try {
            await User.insert(vals);
            throw new Error('User.insert should fail validation');
        } catch (e) {
            expect(e.message).to.equal('User failed validation');
        }
    });

    it('fails to create two users with same e-mail, different username', async function() {
        const vals = { ...values, username: 'test2' };
        try {
            await User.insert(vals);
            throw new Error('User.insert should fail validation');
        } catch (e) {
            expect(e.message).to.equal('email/username ‘test@user.com’ already in use');
        }
    });

    it('fails to create two users with same username, different e-mail', async function() {
        const vals = { ...values, email: 'test2@user.com' };
        try {
            await User.insert(vals);
            throw new Error('User.insert should fail validation');
        } catch (e) {
            expect(e.message).to.equal('email/username ‘test’ already in use');
        }
    });

    it('deletes user', async function() {
        const ok = await User.delete(userId);
        expect(ok).to.be.true;
    });

});
