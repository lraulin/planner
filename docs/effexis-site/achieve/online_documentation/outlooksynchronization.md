---
source_url: "http://www.effexis.com/achieve/online_documentation/outlooksynchronization.htm"
title: "Achieve Time Management & Goal Setting Software Help - Outlook Synchronization"
scraped_at: 2026-08-03T15:15:05Z
---

# Achieve Time Management & Goal Setting Software Help - Outlook Synchronization

_Archived from [http://www.effexis.com/achieve/online_documentation/outlooksynchronization.htm](http://www.effexis.com/achieve/online_documentation/outlooksynchronization.htm)_

---

Achieve supports Microsoft Outlook® synchronization using the Outlook® automation interface, which means that Outlook® must be installed on the same computer as Achieve. While it was designed to work with Microsoft Outlook® 2003, it should also work with Outlook® XP and Outlook® 2000. It may or may not work with Outlook® 97 or earlier. NOTE: Microsoft Outlook® is a registered trademark of Microsoft.
You can invoke the Outlook Synchronization dialog through the [Tools menu](toolsmenu.md).
**Sync Now**
Start the synchronization process
**Settings...**
Adjust synchronization settings (see [Outlook Synchronization Settings](outlooksynchronizationsettin.md))
**Close**
Close the dialog
**Help**
Display this topic
**Stop**
Stop the synchronization without completing it
The **Log Outlook Sync** checkbox allows you to store a log file of the sync process to help diagnose problems. You can view the log file using the _View Log File_** __** link.
The default Outlook® synchronization process consists of the following steps:

1. Import Emails
2. Synchronize Appointments
3. Synchronize Tasks
4. Synchronize Contacts
   You can control this process (what actually gets done) using the [Outlook Synchronization Settings](outlooksynchronizationsettin.md).
   **Outlook Security

****Microsoft Outlook® 2003 and certain patches of Outlook® XP provide increased security to prevent the spread of viruses. Any application trying to access sensitive Outlook® data using the automation interface (like Achieve) will trigger the security dialog displayed below when certain fields are accessed.
We recommend you check the Allow access for 1 minute box and click on the Yes button. If you click on the No button, the synchronization will proceed but certain fields (like email addresses and body contents) will not be imported properly.
Import Emails
Achieve will create four mail folders under the Outlook® Inbox folder if they are not already present:
· Todo - Represents emails that require an action on your part
· Waiting For - Represents emails that require you to wait for someone else to complete something
· Postponed - Represents emails requiring action that you want to postpone for some time
· Processed - Represents emails that have been processed and are ready for filing or deletion
Achieve will use these folders to import emails during Outlook® synchronization. If you would like to track emails using Achieve, you can move emails from your Inbox to either the Todo, Waiting For or Postponed folders and Achieve will create tasks for each of these emails during the import process.
You can view the email from which a project was imported using the **Actions View Email...** command.
When a project associated with an email is completed or deleted, Achieve will move the email to the processed folder during the next synchronization (if you have not moved it from one of the import folders.) Achieve keeps track of emails that have already been imported so you don't need to remove them from the Todo folder; they will not be reimported in the next synchronization.
Synchronize Appointments
Achieve will synchronize appointments/events (in both directions) based on the [settings](outlooksynchronizationsettin.md) you provide. By default, synchronization will start three weeks before Today (you can import older appointments by specifying the date in the settings.)
Changes that you make in Achieve or in Outlook® will be synchronized (except for meetings which will not be changed in Outlook® even if you change them in Achieve.) If you change an item in both places, the conflict will be resolved based on where the item was imported from (if imported from Outlook®, the Outlook® change takes precedence and vice versa.)
Synchronize Tasks
Depending on your sync settings, Achieve Planner can import, export, or perform a 2-way sync (both directions) of Outlook® task data. Any newly imported Outlook® tasks are imported as tasks of a project called "<New Outlook Tasks>" by default (you can change the name of this project in the advanced task sync settings.)
Contact Synchronization
Achieve will synchronize contacts (in both directions) based on the [settings](outlooksynchronizationsettin.md) you provide. Note that Outlook® distribution lists will not be imported into Achieve.
Changes that you make in Achieve or in Outlook® will be synchronized with conflicts resolved based on where the item was imported from.
See Also
[Using Achieve](usingachieve.md) [Getting Organized Overview](gettingorganizedoverview.md)

Copyright (c) 2004-2007 by [Effexis Software, LLC](../../index.md). All rights reserved.
Spending too much time drawing sequence diagrams? Try our [Sequence Diagram Tool](http://www.sequencediagrameditor.com)
[Other resources](../../links.md)
See also [Time management](http://www.timethoughts.com/time-management.htm) and [personal goal setting](http://www.timethoughts.com/goal-setting.htm) guides to make better use of your time and learn how to set and achieve your important goals.
[Time management software](../planner.md) : [daily planner](http://www.timethoughts.com/timemanagement/daily-planner.htm) : [goal setting software](http://www.timethoughts.com/goalsetting/goal-setting-software.htm) : [definition of time management](http://www.timethoughts.com/timemanagement/definition-time-management.htm)
