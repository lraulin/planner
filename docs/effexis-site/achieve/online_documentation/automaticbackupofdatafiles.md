---
source_url: "http://www.effexis.com/achieve/online_documentation/automaticbackupofdatafiles.htm"
title: "Achieve Time Management & Goal Setting Software Help - Automatic Backup of Data Files"
scraped_at: 2026-08-03T15:15:05Z
---

# Achieve Time Management & Goal Setting Software Help - Automatic Backup of Data Files

_Archived from [http://www.effexis.com/achieve/online_documentation/automaticbackupofdatafiles.htm](http://www.effexis.com/achieve/online_documentation/automaticbackupofdatafiles.htm)_

---

Achieve Planner supports the automatic backup of data files using the Auto-Backup feature, which is enabled by default. You can disable the feature and customize the backup path using the Tools->Options... menu command.
By default, the Auto-Backup feature creates a backup directory in the same location as the data file. If your data file is named "MyDataFile", the backup directory is named "MyDataFileBackup" and contains all the backup files.
The following configuration attributes are available in the Tools->Options... menu command under the Auto-Backup group.
**Enable Auto-Backup**
Check to enable auto-backup, clear to disable
**Backup Path**
Use to specify backup directory path, or leave blank to use default
**Warn every X entries**
Achieve Planner will warn you when the number of entries in the backup directory is a multiple of this value
**Daily rotation**
Specifies the maximum number of backup files created on any given day
Two types of backup files are created: daily rotation and dated.
Every time you save your data file, a new backup copy is created. The files are of the form:
YYYYMMDD_FileNameBackup.ach (Dated)
FileNameBackup_N.ach (Rotation)
Where FileName is the name of your data file. Dated files are created for each day, while multiple rotation files are used every time you save the data file. You can use these in case you need to restore to a file saved previously during the day.
When the daily rotation maximum value is reached, the older backup files are overwritten with new files.

Copyright (c) 2004-2007 by [Effexis Software, LLC](../../index.md). All rights reserved.
Spending too much time drawing sequence diagrams? Try our [Sequence Diagram Tool](http://www.sequencediagrameditor.com)
[Other resources](../../links.md)
See also [Time management](http://www.timethoughts.com/time-management.htm) and [personal goal setting](http://www.timethoughts.com/goal-setting.htm) guides to make better use of your time and learn how to set and achieve your important goals.
[Time management software](../planner.md) : [daily planner](http://www.timethoughts.com/timemanagement/daily-planner.htm) : [goal setting software](http://www.timethoughts.com/goalsetting/goal-setting-software.htm) : [definition of time management](http://www.timethoughts.com/timemanagement/definition-time-management.htm)
