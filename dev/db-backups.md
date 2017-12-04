Database backup procedures
==========================

Currently MongoDB database backups are run on Chris’s machine, and stored on Amazon AWS S3.
The current test databases *test-cam* and *test-grn*, and the common *users* database are backed up.

Backups are made using [`mongodump`](https://docs.mongodb.com/manual/tutorial/backup-and-restore-tools/),
using `--archive` and `--gzip` options (this requires mongo to be installed on the machine making
the backups).

They are uploaded to Amazon AWS S3 using the [`aws`](https://aws.amazon.com/cli)
command. On Linux, `aws` can be installed using `apt`, and authentication details (AWS Access Key
etc) are recorded using `aws configure`.

The script to run the backup is

    backupdir="/home/.../thewhistle/db/"
    mongodump -h <host>:<port> -d <database> -u <username> -p <password> --gzip --archive="$backupdir`date +%Y-%m-%d`-users.ar.gz"
    mongodump -h <host>:<port> -d <database> -u <username> -p <password> --gzip --archive="$backupdir`date +%Y-%m-%d`-test-grn.ar.gz"
    mongodump -h <host>:<port> -d <database> -u <username> -p <password> --gzip --archive="$backupdir`date +%Y-%m-%d`-test-cam.ar.gz"
    aws s3 cp "$backupdir`date +%Y-%m-%d`-users.ar.gz"    "s3://thewhistle.mongodump/`date +%Y`/`date +%m`/"
    aws s3 cp "$backupdir`date +%Y-%m-%d`-test-grn.ar.gz" "s3://thewhistle.mongodump/`date +%Y`/`date +%m`/"
    aws s3 cp "$backupdir`date +%Y-%m-%d`-test-cam.ar.gz" "s3://thewhistle.mongodump/`date +%Y`/`date +%m`/"

This is run as a daily cron job.

Once we have more cash available, we can look into mLab’s own (paid) backup procedures.

Restore
-------

The `mongorestore` utility can be used restore a database from a `mongodump` backup into another
copy – e.g.:

    mongorestore -h <host>:<port> -u <username> -p <password> --gzip --archive=yyyy-mm-dd-users.ar.gz"

Note that (as of MongoDB v3.4) the `--db` (or `-d`) option [doesn’t work](https://jira.mongodb.org/browse/TOOLS-1073)
with `--archive`; the database will retain its original name (such as *heroku_h67fd45g*).

Depending on the context, some of the arguments (host, port, username, password) may be defaulted or
not required.
