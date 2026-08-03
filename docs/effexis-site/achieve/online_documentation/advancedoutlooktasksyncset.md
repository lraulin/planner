---
source_url: "http://www.effexis.com/achieve/online_documentation/advancedoutlooktasksyncset.htm"
title: "Achieve Time Management & Goal Setting Software Help - Advanced Outlook Task Sync Settings"
scraped_at: 2026-08-03T15:15:05Z
---

# Achieve Time Management & Goal Setting Software Help - Advanced Outlook Task Sync Settings

_Archived from [http://www.effexis.com/achieve/online_documentation/advancedoutlooktasksyncset.htm](http://www.effexis.com/achieve/online_documentation/advancedoutlooktasksyncset.htm)_

---

These settings give you more control over the import & export of Project/Task information to & from Outlook.
**General Tab**
**Outlook Folder**
Controls the Outlook Tasks folder that will be used for Task synchronization. Leave blank to use the default task folder.
**Import Project**
Select the name of the Achieve Planner project where newly imported Outlook tasks are stored (as tasks of this project.)
**Conflict Resolution**
Select the method to use when Achieve Planner encounters a conflict during sync. See below for various conflict resolution options.
**Sync Notes Instead of Description**
Check this box if you want the Notes portion of Achieve Planner tasks to be synced with Outlook task body rather than the Description
**Import Completed Outlook Tasks**
If checked, completed Outlook tasks are imported into Achieve Planner. Otherwise, completed Outlook tasks are not imported into Achieve Planner. Default is off.
**Encode Project Name In Task Subject**
Select the way in which you want to encode exported task's project name in the Outlook task subject, or select "Don't Add" to not include the project name in Outlook task subject
**Encode Priority in Task Subject**
Select the way in which you want to encode exported task's priority in the Outlook task subject, or select "Don't Add" to not include the priority in the Outlook task subject
**Conflict Resultion Strategies

****A conflict occurs during a sync operation under the following circumstances:
· If an item has been changed in both Outlook and Achieve Planner since the last sync. This applies to Import Only, Export Only, and 2-way sync operations.
· If an item has been changed in Achieve Planner but not in Outlook since the last Import Only sync (Import Only)
· If an item has been changed in Outlook but not in Achieve Planner since the last Export Only sync (Export Only)
When a conflict is detected, the conflict resolution strategy is used to determine how to handle the conflicting items.
**Use Achieve Planner Data**
Use the Achieve Planner data and overwrite the Outlook changes (when exporting/2-way sync)
**Use Outlook Data**
Use the Outlook data and overwrite the Achieve Planner changes (when importing/2-way sync)
**Flag and Ignore**
Mark the Achieve Planner item with a "{OSyncConflict}" flag at the start of the name and leave the items unchanged
**Manual**
Allows the user to decide how to handle each conflict as it arises
The default conflict resolution setting is **Use Achieve Planner Data**.
**Export Tab**
**Only export projects/tasks with this ancestor priority**
Control which projects/tasks get exported to Outlook based on their "ancestor" priority values (going back all the way up the hierarchy and ignoring unprioritized ancestors)
**Only export projects (not tasks)**
Only projects are exported to Outlook
**Export completed projects/tasks**
By default, completed projects/tasks are not exported to Outlook. Checking this box includes them.
**Delete non-exported items from Outlook**
Checking this box will cause Outlook tasks corresponding to non-exported Achieve Planner projects/tasks to be deleted in Outlook. For example, if you had previously exported B & C tasks to Outlook, and you then filter to only export A's, checking this option will delete the previously exported B's & C's from Outlook.
**Include project name in categories**
Checking this box will include the project name (for Tasks) as part of the Categories. The project name is included as P:<name>, where <name> is replaced by the project's name.
**Flag projects with the following category**
Checking this box and providing a valid category value will add this category to Outlook task items corresponding to Achieve Planner projects
**Flag parents with the following category
Checking this box and providing a valid category value will add this category to exported Outlook task items corresponding to Achieve Planner projects and tasks that have child items (including completed items.)
**Export Achieve Planner custom fields**
Checking this box to include Achieve Planner custom fields as user-defined fields of the Outlook task item. See below for a description of these fields.
**User-Defined Fields in Outlook Task Items

****The following user-defined fields are added to the Outlook task item when the "Export Achieve Planner custom fields" checkbox is checked.
**APPriority**
Textual representation of the item priority (A, A1, B3, etc.)
**APNumPriority**
Numeric representation of the item priority. Sort by this field to match the Achieve Planner grid sorting.
**APProject**
Full name of the project associated with the item (its own full name for projects)
**APEndDate**
End date associated with the item
**APResultArea**
Name of the result area associated with the item
**APIsProject**
True if the item is a project, false otherwise
**APFullPath**
Full path of the item (including project & result area)
See Also
[Outlook Synchronization](outlooksynchronization.md) [Outlook Synchronization Settings](outlooksynchronizationsettin.md) [Using Achieve](usingachieve.md) [Getting Started](gettingstarted.md)

Copyright (c) 2004-2007 by [Effexis Software, LLC](../../index.md). All rights reserved.
Spending too much time drawing sequence diagrams? Try our [Sequence Diagram Tool](http://www.sequencediagrameditor.com)
[Other resources](../../links.md)
See also [Time management](http://www.timethoughts.com/time-management.htm) and [personal goal setting](http://www.timethoughts.com/goal-setting.htm) guides to make better use of your time and learn how to set and achieve your important goals.
[Time management software](../planner.md) : [daily planner](http://www.timethoughts.com/timemanagement/daily-planner.htm) : [goal setting software](http://www.timethoughts.com/goalsetting/goal-setting-software.htm) : [definition of time management](http://www.timethoughts.com/timemanagement/definition-time-management.htm)
