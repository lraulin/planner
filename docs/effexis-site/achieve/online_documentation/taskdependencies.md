---
source_url: "http://www.effexis.com/achieve/online_documentation/taskdependencies.htm"
title: "Achieve Time Management & Goal Setting Software Help - Task Dependencies"
scraped_at: 2026-08-03T15:15:05Z
---

# Achieve Time Management & Goal Setting Software Help - Task Dependencies

_Archived from [http://www.effexis.com/achieve/online_documentation/taskdependencies.htm](http://www.effexis.com/achieve/online_documentation/taskdependencies.htm)_

---

Task dependencies are used to indicate that certain tasks must be completed/started before other tasks can begin. For example, in a house painting project you cannot start painting until you buy the paint. The "Start Painting" task depends on the completion of the "Buy Paint" task.
You can enter task dependencies in the Active Task Schedule view of the [tasks view](tasks.md) in the Predecessors column.
The format of the entry is as follows:
<taskId>[Type][Lag]
Where the taskId value is either the task number in the Active Task Schedule grid (number in the row selector) or the full TaskId value (for example "{7da92497-ee52-4ed5-905d-dc27fd5ca502}") found in the [Task Information Form](taskinformationform.md).
An optional Type value which is one of the following:
**FS**
Finish-to-Start
The task should start when the predecessor finishes (default when no type is specified)
**SS**
Start-to-Start
The task should start when the predecessor starts
**FF**
Finish-to-Finish
The task should finish when the predecessor finishes
**SF**
Start-to-Finish
The task should finish when the predecessor starts
And an optional Lag value of the form: +/-duration where the duration can be specified in minutes (m), hours (h) or days (d).
You can leave the type and lag values off the dependency to indicate the default finish-to-start type with no lag.
You can combine multiple dependencies by separating them with commas: 1,3,7 (FS dependency to task # 1, 3 and 7)
Dependencies are not as widely used in Achieve as in some other tools since task order is determined based on priority values by default. Note that dependencies may cause a low priority task to be scheduled ahead of higher priority tasks. For example, if an A1 task depends on a B task, the B task is scheduled before the A1 task (and therefore any other A2, A3, and so on).
In general, you should avoid using dependencies to order tasks and rely on priority values instead. Use dependencies only when a task cannot begin before another task is completed (cannot start painting until the paint is available) or when you need to use other forms of dependencies (with lags or different types).
See Also
[Tasks](tasks.md) [Project/Task Scheduling](projecttaskscheduling.md)

Copyright (c) 2004-2007 by [Effexis Software, LLC](../../index.md). All rights reserved.
Spending too much time drawing sequence diagrams? Try our [Sequence Diagram Tool](http://www.sequencediagrameditor.com)
[Other resources](../../links.md)
See also [Time management](http://www.timethoughts.com/time-management.htm) and [personal goal setting](http://www.timethoughts.com/goal-setting.htm) guides to make better use of your time and learn how to set and achieve your important goals.
[Time management software](../planner.md) : [daily planner](http://www.timethoughts.com/timemanagement/daily-planner.htm) : [goal setting software](http://www.timethoughts.com/goalsetting/goal-setting-software.htm) : [definition of time management](http://www.timethoughts.com/timemanagement/definition-time-management.htm)
