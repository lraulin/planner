---
source_url: "http://www.effexis.com/achieve/features/recurring-projects-tasks.htm"
title: "Recurring Projects/Tasks Feature"
scraped_at: 2026-08-03T15:15:05Z
---

# Recurring Projects/Tasks Feature

_Archived from [http://www.effexis.com/achieve/features/recurring-projects-tasks.htm](http://www.effexis.com/achieve/features/recurring-projects-tasks.htm)_

---

# Recurring Projects/Tasks Feature

This page describes the recurring projects/tasks feature in Achieve Planner available starting with the 1.2 release.

## Making a Project/Task Recurring

Any project or task can be setup as a recurring project/task. To setup recurrence for a project/task, you can:

1. Use the Recurrence button/menu in the project/task information form
2. Use the Set Recurrence command in the Actions menu
   Both of these options bring up the Recurrence dialog, which allows you to set a date based recurrence, where the recurrence date for each new instance follows a predetermined pattern, or a regeneration based recurrence, where the date for each new instance is based on the current date and the regeneration delay.

## Recurrence and Deadlines

The recurrence date is used to compute the new deadline for the recurring project/task (and all its children) based on the **lead time** value.
Each project/task has a **lead time** field, which determines how far away to set the deadline for new recurring instances of the project/task. The lead time field can be blank, in which case the deadline for the new instance is unchanged for each new instance.
You can specify the lead time for projects/tasks through the appropriate information form or using the new "Recurrence" views for projects/tasks.
When the recurrence is first setup, a dialog appears asking if the "lead time" for the item and all its children should be determined based on existing deadline values.
If 'Yes' is chosen, the lead time field of the item and all its children will be set based on the existing deadlines and Today's date.
For example, if the deadline for Task A is 4 days from now, the lead time will be initialized to 4 days. If you choose 'No', any existing lead time values will not be changed.

## Creating New Instances

New instances of the recurring project/task are created whenever the current instance is completed (either through the state column or using the command.)
All deadlines for the new recurring instance and its children are initialized based on the recurring date and associated lead time values.
All children of the new recurring instance are then uncompleted, which means they are put 'In Progress' if previously completed.

## Skipping a Recurrence

You can skip a recurrence instance by using the 'Skip Recurrence' command in the Actions menu. This will advance the recurrence date of the current instance (without creating a new instance) and adjust the deadlines accordingly based on the new recurrence date.
Currently, skipping a recurrence does not mark children of the recurring item as uncompleted.

## Open Questions

1. Should new recurring instance children be initialized in 'Not Started' when they are uncompleted?
2. Should skip recurrence uncomplete all the children of the instance?
   [ You can discuss these open questions in our forum](http://www.effexis2.com/forum/).
