import { describe, expect, it } from "vitest";
import {
  decodeCheckState,
  decodeNoteFlag,
  decodeShowAs,
  mapExtras,
  parseIsoDurationMinutes,
} from "./mapExtras";
import { parseAchXml } from "./parseXml";

describe("parseIsoDurationMinutes", () => {
  it("parses PT durations", () => {
    expect(parseIsoDurationMinutes("PT30M")).toBe(30);
    expect(parseIsoDurationMinutes("PT1H")).toBe(60);
    expect(parseIsoDurationMinutes("PT1H30M")).toBe(90);
    expect(parseIsoDurationMinutes("PT8H")).toBe(480);
    expect(parseIsoDurationMinutes("nope")).toBeNull();
  });
});

describe("appointment enums", () => {
  it("maps ShowTimeAs and CompletionState", () => {
    expect(decodeShowAs(0)).toBe("free");
    expect(decodeShowAs(1)).toBe("busy");
    expect(decodeShowAs(2)).toBe("tentative");
    expect(decodeShowAs(3)).toBe("out_of_office");
    expect(decodeCheckState(0)).toBe("open");
    expect(decodeCheckState(1)).toBe("done");
    expect(decodeCheckState(2)).toBe("missed");
  });
});

describe("decodeNoteFlag", () => {
  it("maps common codes", () => {
    expect(decodeNoteFlag(0)).toBe("none");
    expect(decodeNoteFlag(1)).toBe("done");
    expect(decodeNoteFlag(2)).toBe("blue");
  });
});

describe("mapExtras", () => {
  it("maps appointments, collapsed time-chart areas, wishes, and notes", () => {
    const xml = `<?xml version="1.0"?>
<AchieveDB>
  <LabelData>
    <LabelDataId>llllllll-llll-llll-llll-llllllllllll</LabelDataId>
    <ColorName>DeepSkyBlue</ColorName>
  </LabelData>
  <TimeCharts>
    <TimeChartId>cccccccc-cccc-cccc-cccc-cccccccccccc</TimeChartId>
    <Name>Ideal Week</Name>
  </TimeCharts>
  <TimeChartAreas>
    <TimeChartAreaId>a1111111-1111-1111-1111-111111111111</TimeChartAreaId>
    <TimeChartId>cccccccc-cccc-cccc-cccc-cccccccccccc</TimeChartId>
    <Text>Work</Text>
    <StartTime>2011-06-07T09:00:00+09:00</StartTime>
    <Duration>PT8H</Duration>
    <Weekday>1</Weekday>
    <LabelDataId>llllllll-llll-llll-llll-llllllllllll</LabelDataId>
  </TimeChartAreas>
  <TimeChartAreas>
    <TimeChartAreaId>a2222222-2222-2222-2222-222222222222</TimeChartAreaId>
    <TimeChartId>cccccccc-cccc-cccc-cccc-cccccccccccc</TimeChartId>
    <Text>Work</Text>
    <StartTime>2011-06-07T09:00:00+09:00</StartTime>
    <Duration>PT8H</Duration>
    <Weekday>2</Weekday>
    <LabelDataId>llllllll-llll-llll-llll-llllllllllll</LabelDataId>
  </TimeChartAreas>
  <Appointments>
    <AppointmentId>aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa</AppointmentId>
    <Subject>Gym</Subject>
    <StartDateTime>2011-06-07T21:30:00+09:00</StartDateTime>
    <EndDateTime>2011-06-07T22:15:00+09:00</EndDateTime>
    <IsAllDayEvent>false</IsAllDayEvent>
    <ShowTimeAs>1</ShowTimeAs>
    <CompletionState>1</CompletionState>
    <HasReminder>true</HasReminder>
    <ReminderTime>15</ReminderTime>
    <Priority>1</Priority>
    <ProjectId>bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb</ProjectId>
  </Appointments>
  <Wishes>
    <WishId>wwwwwwww-wwww-wwww-wwww-wwwwwwwwwwww</WishId>
    <Title>SSD</Title>
    <Type>0</Type>
    <Priority>2500</Priority>
    <ResultAreaId>rrrrrrrr-rrrr-rrrr-rrrr-rrrrrrrrrrrr</ResultAreaId>
    <__ORDINAL__>0</__ORDINAL__>
  </Wishes>
  <NoteItems>
    <NoteItemId>nnnnnnnn-nnnn-nnnn-nnnn-nnnnnnnnnnnn</NoteItemId>
    <Title>Life Plan</Title>
    <Subject>General</Subject>
    <NoteText>18 credits remaining</NoteText>
    <Flag>0</Flag>
    <Expanded>true</Expanded>
    <__ORDINAL__>0</__ORDINAL__>
  </NoteItems>
</AchieveDB>`;

    const extras = mapExtras(parseAchXml(xml));
    expect(extras.appointments).toHaveLength(1);
    expect(extras.appointments[0]?.subject).toBe("Gym");
    expect(extras.appointments[0]?.checkState).toBe("done");
    expect(extras.appointments[0]?.showAs).toBe("busy");
    expect(extras.appointments[0]?.reminderMinutes).toBe(15);
    expect(extras.appointments[0]?.priority).toEqual({ letter: "A", rank: 1 });

    expect(extras.timeCharts).toHaveLength(1);
    expect(extras.timeCharts[0]?.areas).toHaveLength(1);
    const work = extras.timeCharts[0]?.areas[0];
    expect(work?.name).toBe("Work");
    expect(work?.daysOfWeek).toEqual([1, 2]);
    expect(work?.startMinute).toBe(9 * 60);
    expect(work?.durationMinutes).toBe(480);
    expect(work?.backColor).toBe("#00bfff");

    expect(extras.wishes).toHaveLength(1);
    expect(extras.wishes[0]?.kind).toBe("wish_want_dont_have");
    expect(extras.wishes[0]?.title).toBe("SSD");

    expect(extras.notes).toHaveLength(1);
    expect(extras.notes[0]?.title).toBe("Life Plan");
    expect(extras.notes[0]?.body).toBe("18 credits remaining");

    expect(extras.metrics).toHaveLength(0);
    expect(extras.metricEntries).toHaveLength(0);
  });

  it("maps Metrics and MetricTracking", () => {
    const xml = `<?xml version="1.0"?>
<AchieveDB>
  <Metrics>
    <MetricId>mmmmmmmm-mmmm-mmmm-mmmm-mmmmmmmmmmmm</MetricId>
    <Title>Waist Width</Title>
    <GoalId>gggggggg-gggg-gggg-gggg-gggggggggggg</GoalId>
    <Category>Body</Category>
    <Question>What is my waist measurement?</Question>
    <Units>cm</Units>
    <Active>true</Active>
    <Priority>1</Priority>
    <Type>0</Type>
    <ObjectiveTarget>80</ObjectiveTarget>
    <__ORDINAL__>0</__ORDINAL__>
  </Metrics>
  <MetricTracking>
    <MetricTrackingId>tttttttt-tttt-tttt-tttt-tttttttttttt</MetricTrackingId>
    <MetricId>mmmmmmmm-mmmm-mmmm-mmmm-mmmmmmmmmmmm</MetricId>
    <Date>2016-01-05T00:00:00Z</Date>
    <Type>0</Type>
    <Target>80</Target>
    <Value>95</Value>
  </MetricTracking>
</AchieveDB>`;
    const extras = mapExtras(parseAchXml(xml));
    expect(extras.metrics).toHaveLength(1);
    expect(extras.metrics[0]).toMatchObject({
      title: "Waist Width",
      ownerAchId: "gggggggg-gggg-gggg-gggg-gggggggggggg",
      category: "Body",
      units: "cm",
      objectiveTarget: 80,
      metricType: "total",
      active: true,
    });
    expect(extras.metricEntries).toHaveLength(1);
    expect(extras.metricEntries[0]).toMatchObject({
      metricAchId: "mmmmmmmm-mmmm-mmmm-mmmm-mmmmmmmmmmmm",
      entryDate: "2016-01-05",
      value: 95,
      target: 80,
      entryType: "new_total",
    });
  });
});
