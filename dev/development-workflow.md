The Whistle development workflow
================================

The Whistle development workflow uses:

- workflow based on [GitHub Flow](https://guides.github.com/introduction/flow/)
- continuous integration using [CircleCI](https://circleci.com/)
- [Heroku GitHub integration](https://devcenter.heroku.com/articles/github-integration) for automatic
  builds of [review apps](https://devcenter.heroku.com/articles/github-integration-review-apps),
  staging, and production environments.

The [GitHub Flow](https://guides.github.com/introduction/flow/) is a straightforward workflow that
keeps things simple, and leverages the GitHub pull request mechanism for code review and conversation
about proposed changes. Essentially the master branch always reflects the production environment,
and all development is done on topic branches.

Continuous integration tests are performed using [CircleCI](https://circleci.com/) (it is widely used,
offers good GitHub integration and Node.js support, and has a free tier which applies for private
GitHub repositories and should be adequate for The Whistle).

[Heroku auto-deployment](https://devcenter.heroku.com/articles/github-integration#automatic-deploys)
means that 
- a push to a topic branch with a pull request will automatically deploy to a Heroku review app
- a push to the GitHub ‘staging’ branch will automatically deploy to the Heroku staging site
- a push to ‘master’ (normally by merging ‘staging’ into master) will automatically deploy to the
  Heroku production environment

Heroku [review apps](https://devcenter.heroku.com/articles/github-integration-review-apps) are 
temporary disposable test apps matching topic branches with pull requests. Using review apps means
that functionality of proposed changes in git development branches can be evaluated by different
members of the team, away from the developer’s local environment.

*Note on use of localhost*: the app expects to see subdomains `admin.` and `report.`, so local
development cannot be done simply on `localhost`. In addition, authentication cookies are held in
the top-level domain to facilitate common logins between the `admin.` and `report.` domains. Since
browsers forbid cookies stored in `localhost`, this means an extra level of subdomain must be used
for local development. The following `/etc/hosts` entry is suggested:

    127.0.0.1 admin.thewhistle.local report.thewhistle.local

In more detail
--------------

### Minor changes

Smaller changes may not require review apps to be built for evaluation by other team members. In
this case changes are made directly in the staging branch for sign-off, then staging is merged into
master. The workflow is as follows:

    $ git pull origin # (refresh local master & staging; local should never be ahead of remote)
    $ git checkout staging
    <make changes & commit>
    $ npm test
    $ git push origin staging
    $ npm run test-smoke
    <optionally do further tests in staging environment>
    <get sign-off>
    $ git checkout master
    $ git merge staging
    $ git push origin master

If access to the Heroku pipeline dashboard is not available to confirm when the staging app is 
rebuilt, dyno metadata (including build creation timestamp) is available at 
[admin.staging.thewhistle.org/dev/dyno](https://admin.staging.thewhistle.org/dev/dyno).

Note that no changes are pushed directly into master, but always via staging, so there should never 
be a need to rebase staging off master.

To avoid impeding other developers’ workflow, changes should never remain in staging longer than 24
hours before being promoted to master.

### Review apps

New or changed functionality which will require evaluation by other team members is done on topic 
branches.

A new topic branch should always be branched from master (after having updated the local master to
match the GitHub master, of course):

    $ git pull origin
    $ git checkout -b my-new-development master

Note that topic branches are normally branched from master rather than from staging, so that should 
staging changes have to be rolled back, topic branches are not affected. TODO: is this correct?

In order to minimise merge conflicts, it is worth regularly pulling the current master into the
topic branch using

    $ git pull origin && git rebase master my-new-development

Always pull using rebase in order to keep the commit history clean of spurious merge commits.

Note that use of a graphical mergetool such as Perforce
[p4merge](https://www.perforce.com/products/helix-apps/merge-diff-tool-p4merge) makes life _much_
easier dealing with merge conflicts! It’s also well worth it just as a difftool for checking what
has been updated prior to committing.

Note that during local development, database connection details are held in the `.env` file, which
is _not_ checked in to the repository.

#### Deployment

When development is sufficiently mature for review, the topic branch can be pushed to GitHub, using:

    $ git push -u origin my-new-development

Then on GitHub [open a pull request](https://help.github.com/articles/creating-a-pull-request/) to
merge that branch into staging. Opening the pull request will automatically create a Heroku review 
app.

The review app is named after the GitHub pull request number: for e.g. pull request #99, the Heroku
app would be named `thewhistle-staging-pr-99`. This would be available at
http://thewhistle-staging-pr-99.herokuapp.com.

The review app **must** have NODE_ENV set to _development_ (the Heroku default is production); it
will also require the `DB_USERS` and organisation db environment variables set, and potentially
others.

Also since a subdomain cannot be specified when running the review app, the `SUBAPP` environment
variable will have to be set to either _admin_ or _report_ as appropriate.

    $ heroku config:set NODE_ENV=development --app thewhistle-staging-pr-99
    $ heroku config:set SUBAPP=report --app thewhistle-staging-pr-99

...and similarly for `DB_USERS` and organisation db environment variables; values can be obtained
from

    $ heroku config --app thewhistle-staging

Setting environment variables for a review app individually can be tedious; the shell script
`heroku-config-review-app` will set Heroku config variables for a review app from the `.env` file.

GitHub pull request comments can be used for discussion about the proposed development.

#### Review cycle

If changes are made as a result of reviews, the procedure for deploying them to the review app
(after having committed changes to the topic branch) is

    $ git pull origin && git rebase master my-new-development
    $ git push --force-with-lease origin my-new-development

The `--force-with-lease` option will update the rebased commits, but will refuse to zap any other 
commits.

Pushing to the topic branch will automatically deploy the new version to the review app.

#### Merge to staging & master

Once review is complete, it can be merged to staging (and deployed) with:

    $ git pull origin
    $ git rebase staging my-new-development
    $ git checkout staging && git merge my-new-development
    $ npm test
    $ git push origin staging
    $ npm run test-smoke # (and further tests if required)
    $ git checkout master && git merge staging
    $ git push origin master
    $ git branch -d my-new-development
    $ git push -d origin my-new-development

Always run a final test before pushing in order to avoid CI failures. Always garbage collect the
merged topic branch.

If other clones of the repository have the topic branch, they can then delete it by using `git fetch
origin --prune`.

Note that topic branches are always merged into staging, not vice versa (topic branches are rebased
from master).

When any commit (either a simple commit or a merge commit of topic branch) is pushed to the GitHub
repository `staging` branch, it will be automatically deployed to the staging app
([admin.staging.thewhistle.org](http://admin.staging.thewhistle.org) /
[report.staging.thewhistle.org](http://report.staging.thewhistle.org)) for final testing; when
staging is merged to master (and pushed to the GitHub repository), it will be automatically deployed
to the production environment.

### Don’t rewrite history

Forced pushes (`git push --force`) are essentially verboten. If – and only if – there is complete
confidence that no one else has accessed the updated repo (fetched, pulled, or cloned), and that no
one had pushed since the last pull, then a forced push might be acceptable – but this should be
exceptional, and pre-arranged with all members of the team – on force of court martial!
