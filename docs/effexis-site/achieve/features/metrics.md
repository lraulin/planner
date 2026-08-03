---
source_url: "http://www.effexis.com/achieve/features/metrics.htm"
title: "Achieve Planner Metrics Feature - Measurements for Success"
scraped_at: 2026-08-03T15:15:05Z
---

# Achieve Planner Metrics Feature - Measurements for Success

_Archived from [http://www.effexis.com/achieve/features/metrics.htm](http://www.effexis.com/achieve/features/metrics.htm)_

---

# Achieve Planner Metrics

The metrics feature in Achieve Planner allows you to track values for a particular variable or measure over time. For example, you could use a metric to keep track of your weight each week, the number of pages or words you've written each day, or the amount of money you are saving in your investment account each month.
You can associate metrics with goals, dreams, or just use them as stand alone measurements.

## Main Metrics View

The Metrics view (available from the Go menu) allows you to see all your metrics at a glance, add tracking values, and view performance graphs for each of them.
You can also add and/or delete metrics directly from this view.
The following metric-related commands are available from the _Actions_ menu:
» **View Performance Graph** \- View the performance graph for the selected metric based on all the data entered so far
» **Add Tracking Entry** \- Add a tracking entry to the selected metric
The goal and dream information forms also contain tabs for metrics associated with the dream/goal.
You can open individual metric rows (double-click on the row, or use the File->Open->Open Selected Items command) to show the metric information form.

## Metric Information Form

[ [Achieve Planner's Metric Information Form - General Tab]](../images/MetricInformationSS.png)
The following fields are available:
» Title - A brief title for the metric
» Owner - Identifies the Goal or Dream that owns the metric (or None if it is a standalone metric.) You can use the _Set_ button to change the owner.
» Category - User-definable category value for each metric to aid in grouping
» Recurrence - You can specify a recurrence pattern for the metric to help you remember when to take the measurements. Use Set Recurrence to create the pattern.
» Has Reminder - If you want to be reminded of the metric when the recurrence dates arrive, check the box, otherwise leave it unchecked.
» Reminder Time - Determines what time the reminder for the metric is displayed on the dates of the recurrence.
» Description - Enter a description for the metric
» Reason - You can describe the reasons why you are keeping track of this metric. The better the reasons you are tracking it, the more motivated you will be to keep it current.
[ [Achieve Planner's Metric Information Form - Tracking Tab]](../images/MetricTrackingSS.png)
The tracking tab allows you to specify the type of metric you are tracking, set objective and/or contribution targets, and modify the individual tracking entries.
» Active - Specifies whether the metric is currently active or not
» Question - Use the question to help you describe what it is that you are measuring. For example, your question could be 'How many times did you exercise this week?', 'How many miles did you run this week?' or 'What is your current weight?'
» Units - If applicable, you can describe the units of measure. Examples include pounds, miles, dollars, minutes, etc.
» Type - Selects the type of metric that you want to use. The following metric types are supported:

- **Cumulative** \- In a cumulative metric, each new tracking value adds to the growing total. For example, if you are trying to save money towards some goal, you would use a cumulative metric so that your contributions each week are added to the growing total.
- **Total** \- In a total metric, each new tracking value represents the new total for the metric. For example, if you are keeping track of your weight, you would use a total metric so that your entry each week represents your new total weight.
- **Instance** \- In an instance metric, each new tracking value represents a completely independent instance. For example, if you want to measure how many miles you run each day, you would use an instance metric since each entry is independent of the others.
  » Objective target - If you have a target you want to reach, check this box and enter the target value in the 'Value' textbox
  » Contribution target - For cumulative and instance metrics, you can define contribution targets in addition to any objective targets. The contribution target is your target for each new tracking entry.
  For example, if your goal is to save $200 a month in order to go on a $2000 vacation, your objective target would be $2000, and your contribution target would be $200.
  The following values are available:
- **None** \- Don't use a contribution target
- **Default** \- Use the default contribution target for each tracking entry
- **By Weekday** \- Specify a different contribution target depending on the day of the week where the metric is measured
- **Automatic** \- The new contribution target is automatically determined based on previous contribution targets (see below)
  Automatic contribution target fields:
  » Auto-increase type - Indicate whether to increase/decrease by percentage or amount
  » Auto-increase amount - Indicate the amount to increase/decrease (either percentage or actual amount). Use negative values for decrease.
  » Auto-increase from - Indicate the value to use to generate the new target (either the previous target or actual contribution)
  » Min - The automatic target should not be below this value
  » Max - The automatic target should not be above this value
  Tracking values - You can use the tracking values grid to add, delete, or edit tracking values for the metric. Each tracking value can specify the date of the entry, the target (if any), and the actual amount being measured.
  Tracking entry target values are meaningful for contribution and instance metrics, where you have an individual target for each entry.
  They are not as useful for total metrics where you just record the new total in each new entry.
