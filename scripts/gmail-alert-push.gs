/**
 * Push bank alert emails to Planner as card holds.
 * Spec: agent-os/specs/2026-10-03-1500-card-holds-from-alert-emails/ (D5).
 *
 * Runs in Lee's Google account (script.google.com), time-triggered every 5 minutes. It parses
 * nothing: Planner reads the plain text, so a wording change at the bank is a Planner deploy,
 * not an edit here.
 *
 * Setup
 *   1. script.google.com > New project; paste this file.
 *   2. Project Settings > Script properties:
 *        PLANNER_URL = https://<your planner host>   (no trailing slash)
 *        PLANNER_AGENT_API_KEY = the same value as the server's PLANNER_AGENT_API_KEY
 *   3. Run `pushAlerts` once and approve the Gmail + external-request scopes.
 *   4. Triggers > Add trigger > pushAlerts > Time-driven > Minutes timer > Every 5 minutes.
 *
 * Bookkeeping is per MESSAGE, not per thread or label: Capital One threads several alerts
 * together, and a thread label would hide every alert that arrives after the first. Handled
 * message ids live in a script property, pruned to the two-day search window. Planner treats
 * a re-push as a no-op, so losing that property only costs a repeat.
 *
 * A 2xx (the hold exists or already did) and a 422 (Planner read it and refused; the raw text
 * is in the audit trail) both mark a message handled. Anything else leaves it for the next run.
 */

var SEARCH =
  "from:(capitalone@notification.capitalone.com) " +
  'subject:"new transaction was charged" newer_than:2d';
// Add Chase once a real per-purchase alert exists:
//   from:(capitalone@notification.capitalone.com OR no.reply.alerts@chase.com)

function pushAlerts() {
  var props = PropertiesService.getScriptProperties();
  var base = props.getProperty("PLANNER_URL");
  var key = props.getProperty("PLANNER_AGENT_API_KEY");
  if (!base || !key) throw new Error("Set PLANNER_URL and PLANNER_AGENT_API_KEY.");

  var handled = JSON.parse(props.getProperty("HANDLED_IDS") || "[]");
  var seen = {};
  var stillInWindow = [];

  GmailApp.search(SEARCH, 0, 50).forEach(function (thread) {
    thread.getMessages().forEach(function (message) {
      var id = message.getId();
      seen[id] = true;
      if (handled.indexOf(id) !== -1) {
        stillInWindow.push(id);
        return;
      }
      var response = UrlFetchApp.fetch(base + "/api/finances/alerts", {
        method: "post",
        contentType: "application/json",
        headers: { Authorization: "Bearer " + key },
        muteHttpExceptions: true,
        payload: JSON.stringify({
          messageId: id,
          from: message.getFrom(),
          subject: message.getSubject(),
          receivedAt: message.getDate().toISOString(),
          plainText: message.getPlainBody(),
        }),
      });
      var code = response.getResponseCode();
      if ((code >= 200 && code < 300) || code === 422) stillInWindow.push(id);
      else console.error("Planner answered " + code + ": " + response.getContentText());
    });
  });

  props.setProperty("HANDLED_IDS", JSON.stringify(stillInWindow));
}
