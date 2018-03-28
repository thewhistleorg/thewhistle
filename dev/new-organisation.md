Setting up a new organisation
=============================

As explained in the [readme](/dev/notes/readme), each organisation’s data is held in entirely 
separate databases. They also have separate buckets in AWS S3 to store uploaded files.

These notes set out how to set up a new organisation.


MongoDB
-------

In principle, any MongoDB database could be used, as long as we have a publicly-accessible 
connection string for it.

Currently, all Whistle databases are hosted with [mLab](https://mlab.com/). Details for provisioning
a database are set out at 
[devcenter.heroku.com/articles/mongolab](https://devcenter.heroku.com/articles/mongolab).

The simplest way to provision a new database is from the command line:

    $ heroku addons:create mongolab

Though note this will create a *Sandbox plan* database, which will probably not be appropriate for 
production use.

The connection string for the new database can be obtained by the `heroku config` command. A new 
config variable will have been created with a name such as `MONGOLAB_GOLD_URI`.

*The Whistle* app expects environment variables of the form `DB_ORG`, so create a new Heroku config
var with the command

    $ heroku config:set DB_NEWORG=<connection-string>
    $ heroku config:set DB_NEWORG=<connection-string> --app thewhistle-staging

And add the `DB_NEWORG` environment variable to the `.env` file.


AWS S3
------

In [console.aws.amazon.com](https://s3.console.aws.amazon.com), create a new bucket 
`thewhistle.neworg` in *EU (London)* region.

Project folders will be created automatically.


Test environment
----------------

In our current configuration, we have a separate organisation for testing purposes, so that tests
can be run which create & delete reports etc without impacting an organisation’s live environment.

MongoDB: for an organisation `neworg`, set up a `DB_NEWORG_TEST` database as described above (this 
one *can* be on a *Sandbox plan*!).

CircleCI will also require the `DB_NEWORG_TEST` environment variable. In `Builds` | `thewhistle` |
settings, go to `Environment Variables` and add the variable.

AWS S3: create a new bucket `thewhistle.neworg-test`.

Then create a symbolic link which will make the submission reports available under a test 
organisation url:

    $ cd app-report && ln -s ../neworg neworg-test

If parameterised questions are used, they will have to be replicated from *neworg* to *neworg-test*.
