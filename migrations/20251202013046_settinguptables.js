// migrations/20251201_create_ella_rises_schema.js

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    // IMPORTANT: return the chain so Knex can wait on it
    return knex.schema
      // PARTICIPANT
      .createTable("Participants", (table) => {
        table.increments("ParticipantID").primary();
        table.string("ParticipantEmail", 255).notNullable().unique();
        table.string("ParticipantFirstName", 100).notNullable();
        table.string("ParticipantLastName", 100).notNullable();
        table.date("ParticipantDOB");
        table.string("ParticipantRole", 50);
        table.string("ParticipantPassword", 255);
        table.string("ParticipantPhone", 50);
        table.string("ParticipantCity", 100);
        table.string("ParticipantState", 50);
        table.string("ParticipantZip", 20);
        table.string("ParticipantSchoolOrEmployer", 255);
        table.string("ParticipantFieldOfInterest", 255);
        table.timestamp("AccountCreatedDate")
        .defaultTo(knex.fn.now());
      })
  
      // EVENT TEMPLATE
      .then(() =>
        knex.schema.createTable("Event_Templates", (table) => {
          table.increments("EventID").primary();
          table.string("EventName", 255).notNullable().unique();
          table.string("EventType", 100);
          table.text("EventDescription");
          table.string("EventRecurrencePattern", 100);
          table.integer("EventDefaultCapacity");
        })
      )
  
      // EVENT OCCURRENCE
      .then(() =>
        knex.schema.createTable("Event_Occurrence", (table) => {
          table.increments("OccurrenceID").primary();
  
          table
            .integer("EventID")
            .notNullable()
            .references("EventID")
            .inTable("Event_Templates")
            .onDelete("RESTRICT")
            .onUpdate("CASCADE");
  
          table.timestamp("EventDateTimeStart").notNullable();
          table.timestamp("EventDateTimeEnd");
          table.string("EventLocation", 255);
          table.integer("EventCapacity");
          table.timestamp("EventRegistrationDeadline");
  
          table.unique(["EventID", "EventDateTimeStart"]);
        })
      )
  
      // REGISTRATION
      .then(() =>
        knex.schema.createTable("Registration", (table) => {
          table.increments("RegistrationID").primary();
  
          table
            .integer("ParticipantID")
            .notNullable()
            .references("ParticipantID")
            .inTable("Participants")
            .onDelete("RESTRICT")
            .onUpdate("CASCADE");
  
          table
            .integer("OccurrenceID")
            .notNullable()
            .references("OccurrenceID")
            .inTable("Event_Occurrence")
            .onDelete("RESTRICT")
            .onUpdate("CASCADE");
  
          table.string("RegistrationStatus", 50);
          table.boolean("RegistrationAttendedFlag");
          table.timestamp("RegistrationCheckInTime");
          table.timestamp("RegistrationCreatedAt");
  
          table.unique(["ParticipantID", "OccurrenceID"]);
        })
      )
  
      // SURVEY
      .then(() =>
        knex.schema.createTable("Surveys", (table) => {
          table.increments("SurveyID").primary();
  
          table
            .integer("RegistrationID")
            .notNullable()
            .unique()
            .references("RegistrationID")
            .inTable("Registration")
            .onDelete("CASCADE")
            .onUpdate("CASCADE");
  
            table.integer("SurveySatisfactionScore");       // 0–5 whole number
            table.integer("SurveyUsefulnessScore");         // 0–5 whole number
            table.integer("SurveyInstructorScore");         // 0–5 whole number
            table.integer("SurveyRecommendationScore");     // 0–5 whole number
            
            // Average of the 4 above — can have decimals
            table.decimal("SurveyOverallScore", 4, 2);      // example: 4.25
            
            table.string("SurveyNPSBucket", 50);
            table.text("SurveyComments");
            table.timestamp("SurveySubmissionDate").defaultTo(knex.fn.now());
        })
      )
  
      // PARTICIPANT MILESTONES
      .then(() =>
        knex.schema.createTable("Participant_Milestone", (table) => {
          table.increments("MilestoneID").primary();
  
          table
            .integer("ParticipantID")
            .notNullable()
            .references("ParticipantID")
            .inTable("Participants")
            .onDelete("RESTRICT")
            .onUpdate("CASCADE");
  
          table.string("MilestoneTitle", 255).notNullable();
          table.date("MilestoneDate");
        })
      )
  
      // PARTICIPANT DONATIONS
      .then(() =>
        knex.schema.createTable("Participant_Donation", (table) => {
          table.increments("DonationID").primary();
  
          table
            .integer("ParticipantID")
            .notNullable()
            .references("ParticipantID")
            .inTable("Participants")
            .onDelete("RESTRICT")
            .onUpdate("CASCADE");
  
          table.date("DonationDate"); // can be NULL
          table.decimal("DonationAmount", 10, 2);
        })
      );
  };
  
  /**
   * @param { import("knex").Knex } knex
   * @returns { Promise<void> }
   */
  exports.down = function (knex) {
    // reverse order of creation
    return knex.schema
      .dropTableIfExists("Participant_Donation")
      .then(() => knex.schema.dropTableIfExists("Participant_Milestone"))
      .then(() => knex.schema.dropTableIfExists("Surveys"))
      .then(() => knex.schema.dropTableIfExists("Registration"))
      .then(() => knex.schema.dropTableIfExists("Event_Occurrence"))
      .then(() => knex.schema.dropTableIfExists("Event_Templates"))
      .then(() => knex.schema.dropTableIfExists("Participants"));
};
