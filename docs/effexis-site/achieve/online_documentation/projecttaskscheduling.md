---
source_url: "http://www.effexis.com/achieve/online_documentation/projecttaskscheduling.htm"
title: "Achieve Time Management & Goal Setting Software Help - Project/Task Scheduling"
scraped_at: 2026-08-03T15:15:05Z
---

# Achieve Time Management & Goal Setting Software Help - Project/Task Scheduling

_Archived from [http://www.effexis.com/achieve/online_documentation/projecttaskscheduling.htm](http://www.effexis.com/achieve/online_documentation/projecttaskscheduling.htm)_

---

Achieve performs project/task scheduling for active projects and tasks (that are not completed, postponed or in the D priority category) when the **Actions Reschedule** command is invoked (see [Actions menu](actionsmenu.md)). This topic describes the process that Achieve uses when scheduling projects and tasks.
You supply the level of effort, dependencies and resources for each task and Achieve will calculate the schedule for the tasks and associated projects. Each task within a project has the following scheduling values:
· Target start date - The target start date for the task
· Target end date - Projected end date for the task
· Effort Left - Amount of effort that is still required to complete the task (this is effort and not duration)
· Resource Assignments - Resources that are assigned to work on the task
· Dependencies - Specify when a task can start in relation to other tasks
· Constraints - Place limits on when a task can start/end
Only projects that are marked as "Effort Driven" (default for projects) will be scheduled by Achieve. Non-effort driven projects will use the date and effort values manually set for their tasks but will not automatically compute them based on resource availability or effort values. You can set the Effort Driven value in the [Project Information Form](projectinformationform.md) or via one of the scheduling views.
**Project Start

****You can set the target start date for the project manually or leave it blank. If you leave it blank, it will automatically be set to Today during scheduling. You can use the Project Start value to specify that a project will begin sometime in the future rather than now. If you've previously specified a project start date, but now want the project start to be adjusted when projects are rescheduled, you need to clear the existing value (clear using backspace key on Target Start Date cell) before issuing the reschedule command.
**Effort Values

Achieve uses level of effort values to measure the amount of work needed to complete a task. The level of effort is the amount of work that it would take an average person in your team to complete the task if they spent 100% of their time on it. It is not the same as the calendar duration of the task which depends on factors such as resource assignments, holidays/vacations, weekends, etc. With this measure you can compare one task against another irrespective of what else was going on during that time. The level of effort is the same whether you can devote one hundred percent or only fifty percent of a resource's time to the task.
Effort values can be entered in the following units:
· Minutes (m or min) 5 m
· Hours (h) 20.5 h or 20:30 h (20 hours 30 minutes)
· Days (d) 2 d A day is considered to be 8 hours
· Weeks (w) 1 w A week is considered to be 40 hours
When a project has no tasks associated with it, it is treated for scheduling purposes as if it had a single task with no dependencies/constraints and with the same target start and effort left as the project.
You can specify the target start date for a project which will be used to schedule all tasks for that project.
The scheduling algorithm processes tasks in order of project & task priority (A1 tasks before A2 tasks, etc) using the specified resource allocation until the task is completed. If multiple projects/tasks share the same resource, projects/tasks with higher priority take precedence over projects with lower priority as follows:
· "A" priority tasks of all "A" priority projects (ordered by project/task priority)
· "B" priority tasks of all "A" priority projects (ordered by project/task priority)
· "A" priority tasks of all "B" priority projects (ordered by project/task priority)
· "B" priority tasks of all "B" priority projects (ordered by project/task priority)
· "C" priority tasks of all "A" priority projects (ordered by project/task priority)
· "C" priority tasks of all "B" priority projects (ordered by project/task priority)
· All tasks of "C" priority projects (ordered by project/task priority)
You can also use project or task resource assignments to limit the amount of a resource that is available for a particular project/task therefore making part of the resource available to spend some of his/her time in other projects/tasks with lower priority.
**Summary Tasks

****A task with children is considered a summary task for scheduling purposes and does not contribute directly to the level of effort for tasks. All the scheduling information for the children are used to calculate the values for the summary task. The only meaningful fields are:
· Dependencies - Dependencies placed at the summary task level affect all children
· Resource Assignments - Any resource assignments at the summary task level are used by default by any child tasks that don't have explicit assignments
**Scheduled Project Blocks

****Tasks assigned to your personal and work resources (default when there is no assignment at the task or project level) can specify the amount of effort available for various dates based on the project blocks scheduled in the Weekly Schedule view. The**Project Block Scheduling Options...** in the Tools menu can be used to specify if project blocks should be used for scheduling and what date limit should be used.**

**Resources

****Resources represent potential for work associated with one or more people. Typically each resource represents a single person working on one or more projects. You can explicitly assign the resources associated with each task using a[Task Resource Assignment](taskresourceassignments.md). If a resource is not explicitly assigned to a task, the default resource assignment for the task is determined as follows:
· Use the resource assignment of the closest parent task with an explicit assignment
· Use the default resource for the project (if it has one)
· Use the default resource for the project's result area (if it has one)
· Use the default resource for the result area category (if there is one)
· Use the standard default resource
See [Resources](resources.md) topic for more details.
**Lead Time Based Scheduling

****Lead time based scheduling provides a convenient way to schedule the target start date for projects/tasks with deadlines. The Lead Time value (available through the information forms and/or scheduling views) specifies the number of days prior to the project/task deadline when you want to start the project/task.
For example, if you set the lead time to 10 days, the target start date is set to 10 days before the deadline.
Lead time based scheduling only applies to items with deadlines. Projects/tasks without deadlines will not be affected by the lead time values.
The target end date is not affected by the lead time. Depending on whether the item is effort driven or not, Achieve Planner will either automatically compute the target end date based on effort estimates (effort driven), or it will have to be set manually.
See Also
[Task Constraints](taskconstraints.md) [Task Dependencies](taskdependencies.md) [Task Resource Assignments](taskresourceassignments.md) [Project Resource Assignments](projectresourceassignments.md)

Copyright (c) 2004-2007 by [Effexis Software, LLC](../../index.md). All rights reserved.
Spending too much time drawing sequence diagrams? Try our [Sequence Diagram Tool](http://www.sequencediagrameditor.com)
[Other resources](../../links.md)
See also [Time management](http://www.timethoughts.com/time-management.htm) and [personal goal setting](http://www.timethoughts.com/goal-setting.htm) guides to make better use of your time and learn how to set and achieve your important goals.
[Time management software](../planner.md) : [daily planner](http://www.timethoughts.com/timemanagement/daily-planner.htm) : [goal setting software](http://www.timethoughts.com/goalsetting/goal-setting-software.htm) : [definition of time management](http://www.timethoughts.com/timemanagement/definition-time-management.htm)
