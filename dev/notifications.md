Event Notifications
===================

Currently, events that get notified are:

- new report submitted
- report assigned to user
- user’s report received new comment
- user mentioned in comment

This list may change over time.

Notifications are shown at the top right of the window, in the navigation bar.

If there are new notifications, the number of new notifications is shown above a ‘bell’ icon. 
Hovering the cursor over this indication will drop down a list of new notifications. This list
provides links to the report the notification relates to, and a ‘×’ icon to dismiss the notification.

Notifications may either be explicitly dismissed, or may automatically dismissed as the result of 
other user actions.

New report submitted
--------------------

- notification sent to all users (with login rights to the current organisation) when a new report 
  is submitted
- auto-dismissed (for all users) when report gets assigned or archived

Report assigned to user
-----------------------

- user is notified when they are assigned a report, unless they self-assigned the report
- auto-dismissed when user views report, when report gets reassigned or archived

User mentioned in comment
-------------------------

- user notified when they are @mentioned in a comment, unless they posted the comment
- auto-dismissed when user views report, when report gets archived

User’s report received new comment
----------------------------------

- user notified when a report assigned to them receives a new comment, unless they posted the comment
- auto-dismissed when user views report, when report gets archived
