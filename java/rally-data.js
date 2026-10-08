/* Published rally details. Edit on manage.html, then use "Download data file" and replace this file on your server. */
window.RALLY_DEFAULT = {
  "info": {
    "intro": "Rally2Rumble is a regional car rally for teams and passengers who want to drive, compete and enjoy a full day on the road. Every team follows the same route and stages, and everything you need on the day is on this page.",
    "date": "To be confirmed",
    "location": "To be confirmed",
    "format": "Regional car rally",
    "teams": "Driver + passengers"
  },
  "route": {
    "startTime": "10:00",
    "speed": "50",
    "note": "Schematic overview, not to scale. Final route details will be published before the rally.",
    "stages": [
      {"name": "Start", "desc": "Location TBC. Check-in, scrutineering and flag-off.", "dist": "", "wait": "", "steps": [
        {"turn": "straight", "text": "Leave the start area and follow the main road", "km": "1.2"},
        {"turn": "right", "text": "Turn right onto [road name]", "km": "3.5"},
        {"turn": "roundabout", "text": "At the roundabout take the 2nd exit towards [place]", "km": "2.8"},
        {"turn": "left", "text": "Turn left onto [road name]", "km": "4.0"}
      ]},
      {"name": "Stage 1", "desc": "Opening regional stage.", "dist": "", "steps": []},
      {"name": "Stage 2", "desc": "Mid-route stage.", "dist": "", "steps": []},
      {"name": "Lunch stop", "desc": "Regroup, refuel and rest.", "dist": "", "wait": "45", "steps": []},
      {"name": "Stage 3", "desc": "Final stage into the finish.", "dist": "", "steps": []},
      {"name": "Finish", "desc": "Finish line and prize giving.", "dist": "", "steps": []}
    ]
  },
  "agenda": {
    "note": "Times are indicative and may change. The organisers will confirm the final schedule.",
    "items": [
      {"time": "08:00", "title": "Check-in opens", "desc": "Register at the start, collect your rally pack."},
      {"time": "09:00", "title": "Scrutineering", "desc": "Vehicle check before the start."},
      {"time": "09:30", "title": "Driver briefing", "desc": "Route, rules and safety information."},
      {"time": "10:00", "title": "Rally start", "desc": "First team flagged off, others follow at intervals."},
      {"time": "12:30", "title": "Lunch stop", "desc": "Regroup, refuel and rest."},
      {"time": "14:00", "title": "Afternoon stages", "desc": "Remaining stages towards the finish."},
      {"time": "16:30", "title": "Finish", "desc": "Teams arrive at the finish line."},
      {"time": "17:30", "title": "Prize giving", "desc": "Results and closing."}
    ]
  }
};