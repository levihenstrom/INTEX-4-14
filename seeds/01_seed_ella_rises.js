const fs = require("fs");
const path = require("path");

/**
 * CSV loader that supports:
 * - Commas inside double-quoted fields
 * - Escaped quotes as ""
 */
function parseCsvLine(line) {
  const cols = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];

    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote ""
        cur += '"';
        i++; // skip next
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      // Field separator
      cols.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  cols.push(cur);
  return cols.map((c) => c.trim());
}

function loadCsv(relativePath) {
  const fullPath = path.join(__dirname, "..", "data", relativePath);
  const text = fs.readFileSync(fullPath, "utf8");

  const lines = text.trim().split(/\r?\n/);
  const headers = parseCsvLine(lines.shift());

  return lines.map((line) => {
    const cols = parseCsvLine(line);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx];
    });
    return row;
  });
}


exports.seed = async function (knex) {
  console.log("🌱 Seeding Ella Rises…");

  // Wipe tables child → parent
  await knex("Participant_Donation").del();
  await knex("Participant_Milestone").del();
  await knex("Surveys").del();
  await knex("Registration").del();
  await knex("Event_Occurrence").del();
  await knex("Event_Templates").del();
  await knex("Participants").del();

  // -------------------------------------------------------
  // 1) PARTICIPANTS
  // -------------------------------------------------------
  const participantsCsv = loadCsv("participants.csv");

  const participantRows = participantsCsv.map((p) => ({
    ParticipantEmail: p.ParticipantEmail,
    ParticipantFirstName: p.ParticipantFirstName,
    ParticipantLastName: p.ParticipantLastName,
    ParticipantDOB: p.ParticipantDOB,
    ParticipantRole: p.ParticipantRole,
    ParticipantPassword: p.ParticipantPassword,
    ParticipantPhone: p.ParticipantPhone,
    ParticipantCity: p.ParticipantCity,
    ParticipantState: p.ParticipantState,
    ParticipantZip: p.ParticipantZip,
    ParticipantSchoolOrEmployer: p.ParticipantSchoolOrEmployer,
    ParticipantFieldOfInterest: p.ParticipantFieldOfInterest,
    AccountCreatedDate: p.AccountCreatedDate || knex.fn.now(),
  }));

  const insertedParticipants = await knex("Participants")
    .insert(participantRows)
    .returning(["ParticipantID", "ParticipantEmail"]);

  const participantIdByEmail = {};
  insertedParticipants.forEach((p) => {
    participantIdByEmail[p.ParticipantEmail] = p.ParticipantID;
  });

  // -------------------------------------------------------
  // 2) MILESTONES
  // -------------------------------------------------------
  const milestonesCsv = loadCsv("participant_milestone.csv");

  const milestoneRows = milestonesCsv.map((m) => ({
    ParticipantID: parseInt(m.ParticipantID, 10),
    MilestoneTitle: m.MilestoneTitle,
    MilestoneCategory: m.MilestoneCategory,
    MilestoneDate: m.MilestoneDate,
  }));


  await knex("Participant_Milestone").insert(milestoneRows);

  // -------------------------------------------------------
  // 3) DONATIONS
  // -------------------------------------------------------
  const donationsCsv = loadCsv("participant_donation.csv");

  const donationRows = donationsCsv.map((d) => ({
    ParticipantID: parseInt(d.ParticipantID, 10),
    DonationDate: d.DonationDate || null,
    DonationAmount: d.DonationAmount || null,
  }));

  await knex("Participant_Donation").insert(donationRows);

  // 4) EVENT TEMPLATES
const eventTemplatesCsv = loadCsv("event_templates.csv");

const eventTemplateRows = eventTemplatesCsv.map((e) => ({
  // auto incrememnt PK
  EventName: e.EventName,
  EventType: e.EventType,
  EventDescription: e.EventDescription,
  EventRecurrencePattern: e.EventRecurrencePattern,
  EventDefaultCapacity: (() => {
    const n = parseInt(e.EventDefaultCapacity, 10);
    return Number.isNaN(n) ? null : n;
  })(),
}));

await knex("Event_Templates").insert(eventTemplateRows);
// no need for eventIdByName anymore

// 5) EVENT OCCURRENCE
const eventOccurrenceCsv = loadCsv("event_occurrence.csv");

const occurrenceRows = eventOccurrenceCsv.map((o) => {
  const cap = parseInt(o.EventCapacity, 10);

  return {
    // auto incrememnt PK,          
    EventID: parseInt(o.EventID, 10),                    // FK from CSV
    EventDateTimeStart: o.EventDateTimeStart,
    EventDateTimeEnd: o.EventDateTimeEnd,
    EventLocation: o.EventLocation,
    EventCapacity: Number.isNaN(cap) ? null : cap,
    EventRegistrationDeadline: o.EventRegistrationDeadline,
  };
});

await knex("Event_Occurrence").insert(occurrenceRows);
// no occurrenceIdByKey map needed

// 6) REGISTRATION
const registrationCsv = loadCsv("registration.csv");

const registrationRows = registrationCsv.map((r) => ({
  // auto incrememnt PK       
  ParticipantID: parseInt(r.ParticipantID, 10),          // FK → Participants
  OccurrenceID: parseInt(r.OccurrenceID, 10),            // FK → Event_Occurrence
  RegistrationStatus: r.RegistrationStatus,
  RegistrationAttendedFlag: String(r.RegistrationAttendedFlag).toUpperCase() === "TRUE",
  RegistrationCheckInTime: r.RegistrationCheckInTime || null,
  RegistrationCreatedAt: r.RegistrationCreatedAt || null,
}));

await knex("Registration").insert(registrationRows);
// no regIdByParticipantOccurrence needed


// 7) SURVEYS
const surveysCsv = loadCsv("surveys.csv");

const surveyRows = surveysCsv.map((s) => ({
  // auto incrememnt PK          
  RegistrationID: parseInt(s.RegistrationID, 10),        // FK → Registration

  SurveySatisfactionScore: s.SurveySatisfactionScore
    ? parseInt(s.SurveySatisfactionScore, 10)
    : null,
  SurveyUsefulnessScore: s.SurveyUsefulnessScore
    ? parseInt(s.SurveyUsefulnessScore, 10)
    : null,
  SurveyInstructorScore: s.SurveyInstructorScore
    ? parseInt(s.SurveyInstructorScore, 10)
    : null,
  SurveyRecommendationScore: s.SurveyRecommendationScore
    ? parseInt(s.SurveyRecommendationScore, 10)
    : null,
  SurveyOverallScore: s.SurveyOverallScore
    ? Number(s.SurveyOverallScore)
    : null,

  SurveyNPSBucket: s.SurveyNPSBucket || null,
  SurveyComments: s.SurveyComments || null,
  SurveySubmissionDate: s.SurveySubmissionDate || null,
}));

await knex("Surveys").insert(surveyRows);


  console.log("🌱 Ella Rises seeding complete.");
};
