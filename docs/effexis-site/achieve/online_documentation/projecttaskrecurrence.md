---
source_url: "http://www.effexis.com/achieve/online_documentation/projecttaskrecurrence.htm"
title: "Achieve Time Management & Goal Setting Software Help - Project/Task Recurrence"
scraped_at: 2026-08-03T15:15:05Z
---

# Achieve Time Management & Goal Setting Software Help - Project/Task Recurrence

_Archived from [http://www.effexis.com/achieve/online_documentation/projecttaskrecurrence.htm](http://www.effexis.com/achieve/online_documentation/projecttaskrecurrence.htm)_

---

You can setup projects and/or tasks to recur following a specific date pattern, or a number of days/weeks/months/years after the current item is completed. Some examples of recurring projects/tasks: weekly schedule reports, backup routines, monthly maintenance projects, household chores, etc.
**Setting/Removing Recurrence for Projects/Tasks

****You can set and remove the recurrence pattern for projects and tasks using the "Recurrence" button in the[Project Information Form](projectinformationform.md) and [Task Information Form](taskinformationform.md), or by using the _Set Recurrence_ command in the actions menu (available in the [Projects tab](projects.md) and [Tasks tab](tasks.md)).
You can set items to recur following a date pattern (e.g., every 2 weeks on Monday), or to be regenerated using a given time period when the item is completed (e.g., 5 days after item is completed.)
**To remove** the recurrence for an existing item, click on the "Remove Recurrence" button in the Recurrence Pattern dialog.
Only a single instance of each recurring item is shown at any given time. When the item is completed, a new instance is generated and initialized based on the new recurrence date.
**Recurrence, Deadlines, and Lead Time

****Project/task recurrence can be configured to update the deadline date and the start date for the recurring project/task and its children. The deadline of the recurring project/task is updated to match the recurrence date for the item. Deadlines of child items (if they have a deadline) are set relative to the deadline of the recurring item.
For example, if a recurring project has a deadline for May 31st, and a task has a deadline that occurs 3 days before, the pattern of deadlines will be preserved when new recurring instances of the project are created. The project deadline will move to match the new recurrence date, and the task's deadline is set to 3 days before the project's deadline.
The **Lead Time** field of projects and task controls how the target start date is set relative to the deadline. If the Lead Time is set to "None", the target start date is unaffected. Otherwise, the target start date is set to lead time days **before** the deadline.
For example, if the recurrence pattern occurs on the 15th of every month, and the lead time value for the project is set to 5, its deadline will be set to the 15th of the month, and its target start date will be set to the 10th.
The lead time controls the "buffer" between the deadline and the target start date.
You can set the lead time value using the [project information form](projectinformationform.md) or [task information form](taskinformationform.md), or by using the "lead time schedule" views in the Outline or Tasks tabs.
**Initializing the Lead Time Value for Child Projects/Tasks

****When first initializing the recurrence for a project or task with children, a message box will appear asking whether to initialize lead times of children using existing deadlines.
If you answer yes and the recurring item being initialized has a deadline, the lead time value of children items that also have deadlines will be initialized based on the difference between the child's deadline and its target start date.
This will have the effect of preserving the same relative time difference between the target start dates and deadlines of the recurring item and its children as new instances are created.
**Children of Recurring Project/Task

****The children of a recurring project/task are all initialized to the "Not Started" state when each new instance is created.
**Non-Effort Driven Projects/Tasks

****Normally, the automatic scheduling feature determines the start/end dates for projects and tasks, with the exception of non-effort driven items. These items need to be scheduled manually.
When creating a new recurring instance of a project/task, the target end date is cleared (set to none), and needs to be set either manually (for non-effort driven items), or using the reschedule command (for effort driven items.)
**Skipping a Recurrence Instance

****If desired, you can skip a recurrence instance for an item using the _Actions- >Skip Recurrence_ command. This will move the recurrence date forward without creating a corresponding instance.
If the recurrence pattern is set to end after a given number of instances, skipping a recurrence counts as one of those instances.
See Also
[Project Information Form](projectinformationform.md) [Task Information Form](taskinformationform.md)

Copyright (c) 2004-2007 by [Effexis Software, LLC](../../index.md). All rights reserved.
Spending too much time drawing sequence diagrams? Try our [Sequence Diagram Tool](http://www.sequencediagrameditor.com)
[Other resources](../../links.md)
See also [Time management](http://www.timethoughts.com/time-management.htm) and [personal goal setting](http://www.timethoughts.com/goal-setting.htm) guides to make better use of your time and learn how to set and achieve your important goals.
[Time management software](../planner.md) : [daily planner](http://www.timethoughts.com/timemanagement/daily-planner.htm) : [goal setting software](http://www.timethoughts.com/goalsetting/goal-setting-software.htm) : [definition of time management](http://www.timethoughts.com/timemanagement/definition-time-management.htm)
