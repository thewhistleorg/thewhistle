The Whistle development workflow
================================

The Whistle development workflow uses:

- workflow based on [GitHub Flow](https://guides.github.com/introduction/flow/)
- continuous integration using [CircleCI](https://circleci.com/)
- [Heroku GitHub integration](https://devcenter.heroku.com/articles/github-integration) for automatic
  builds of [review apps](https://devcenter.heroku.com/articles/github-integration-review-apps),
  and staging environment.

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
- a push to ‘master’ (either pushing directly to master or merging a topic branch into master) will 
  automatically deploy to the Heroku staging environment
- promotion from staging to master is done within the Heroku control panel

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
this case changes are made directly in the master branch (or merged into the master branch from a
local topic branch). After smoke test, and sign-off if required, the change can be promoted from
staging to production.

### Review apps

New or changed functionality which will require evaluation by other team members is done on topic 
branches.

A new topic branch should always be branched from master (after having updated the local master to
match the GitHub master, of course):

    $ git checkout master && git pull origin master
    $ git checkout -b my-new-development master

Always pull from master before committing, to surface any merge conflicts as early as possible.
In order to minimise merge conflicts, it is worth regularly pulling the current master into the
topic branch using

    $ git checkout master && git pull origin master
    $ git rebase master my-new-development

Always rebase the topic branch from master in order to keep the commit history clean of spurious 
merge commits.

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
merge that branch into master. Opening the pull request will automatically create a Heroku review 
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

    $ git checkout master && git pull origin master && git rebase master my-new-development
    $ git push --force-with-lease origin my-new-development

The `--force-with-lease` option will update the rebased commits, but will refuse to zap any other 
commits.

Pushing to the topic branch will automatically deploy the new version to the review app.

#### Merge to master

Once review is complete, it can be merged to  master and deployed to staging with:

    $ git checkout master && git pull origin master && git rebase master my-new-development
    $ git checkout master && git merge --no-ff my-new-development
    $ npm test
    $ git push origin master
    $ git branch -d my-new-development
    $ git push -d origin my-new-development

Always run a final test before pushing in order to avoid CI failures. Always garbage collect the
merged topic branch.

If other clones of the repository have the topic branch, they can then delete it by using `git fetch
origin --prune`.

Note that topic branches are always merged into master, not vice versa (topic branches are rebased
from master).

When any commit (either a simple commit or a merge commit of topic branch) is pushed to the GitHub
repository `master` branch, it will be automatically deployed to the staging app
([admin.staging.thewhistle.org](http://admin.staging.thewhistle.org) /
[report.staging.thewhistle.org](http://report.staging.thewhistle.org)) for final smoke tests.


Heroku organisation
-------------------

Optimal Heroku organisation for this size of project would probably be [Heroku 
Teams](https://devcenter.heroku.com/articles/heroku-teams). However, [free dynos are not available 
to Teams](https://devcenter.heroku.com/articles/heroku-teams#pricing-and-limits). This means that 
the staging environment and review apps would become chargeable ‘hobby’ dynos, which is currently 
undesirable (the production app is currently the only paid dyno).

The pipeline is currently owned by chrisv@movable-type.co.uk. [Individual pipelines cannot be
transferred directly to other 
individuals](https://devcenter.heroku.com/articles/pipelines#pipelines-ownership-and-transfer), so
this will continue to be the case until and unless we transition to using Heroku Teams, with paid
dynos, at which point ownership can be transferred to the team.

Collaborators can perform most actions on apps & pipelines other than [deleting, transferring or 
renaming the app, adding or removing paid add-ons, or viewing 
invoices](https://devcenter.heroku.com/articles/collaborating#collaborator-permissions), so this 
should not present great problems for collaborative working.
