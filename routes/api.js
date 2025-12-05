const express = require('express');
const router = express.Router();
const knexConfig = require('../knexfile');
const environment = process.env.NODE_ENV || 'development';
const knex = require('knex')(knexConfig[environment]);

// Participants data endpoints
router.get('/participants-by-program', async (req, res) => {
    try {
        const data = await knex('participants')
        .select('program')
        .count('* as count')
        .groupBy('program');
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/participants-by-status', async (req, res) => {
    try {
        const data = await knex('participants')
        // Add your query
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Milestones data endpoints - with optional search/filter support
router.get('/milestones-by-category', async (req, res) => {
    try {
        const { search, filterTitle, filterCategory, filterParticipantID } = req.query;

        let query = knex('Participant_Milestone as m')
            .leftJoin('Participants as p', 'm.ParticipantID', 'p.ParticipantID')
            .whereNotNull('m.MilestoneCategory')
            .whereNot('m.MilestoneCategory', '');

        // Apply search filter
        if (search) {
            query = query.where(function() {
                this.whereRaw('LOWER(m."MilestoneTitle") LIKE ?', [`%${search.toLowerCase()}%`])
                    .orWhereRaw('LOWER(m."MilestoneCategory") LIKE ?', [`%${search.toLowerCase()}%`])
                    .orWhereRaw('LOWER(p."ParticipantFirstName") LIKE ?', [`%${search.toLowerCase()}%`])
                    .orWhereRaw('LOWER(p."ParticipantLastName") LIKE ?', [`%${search.toLowerCase()}%`]);
            });
        }

        // Apply title filter
        if (filterTitle) {
            query = query.whereRaw('LOWER(m."MilestoneTitle") LIKE ?', [`%${filterTitle.toLowerCase()}%`]);
        }

        // Apply participant filter
        if (filterParticipantID) {
            query = query.where('m.ParticipantID', filterParticipantID);
        }

        const results = await query
            .select('m.MilestoneCategory as category')
            .count('* as count')
            .groupBy('m.MilestoneCategory')
            .orderByRaw('count DESC');

        res.json(results);
    } catch (err) {
        console.error('Milestones by category error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/milestones-over-time', async (req, res) => {
    try {
        const data = await knex('milestones')
        // Add your query
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Events data endpoints
router.get('/events-attendance', async (req, res) => {
    try {
        const data = await knex('events')
        // Add your query
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Donations total endpoint
router.get('/donations-total', async (req, res) => {
    try {
        const data = await knex('donations')
        .sum('amount as total');
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Surveys data endpoints
router.get('/surveys-nps', async (req, res) => {
    try {
        const data = await knex('surveys')
        // Add your NPS calculation query
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Survey NPS distribution for stacked bar chart - with optional search/filter support
router.get('/surveys-nps-distribution', async (req, res) => {
    try {
        const { search, filterEventID, filterNPS, filterStartDate, filterEndDate } = req.query;

        let query = knex('Surveys as s')
            .leftJoin('Registration as r', 's.RegistrationID', 'r.RegistrationID')
            .leftJoin('Event_Occurrence as eo', 'r.OccurrenceID', 'eo.OccurrenceID')
            .leftJoin('Event_Templates as et', 'eo.EventID', 'et.EventID')
            .leftJoin('Participants as p', 'r.ParticipantID', 'p.ParticipantID')
            .whereNotNull('s.SurveyNPSBucket')
            .whereNot('s.SurveyNPSBucket', '');

        // Apply search filter
        if (search) {
            query = query.where(function() {
                this.whereRaw('LOWER(et."EventName") LIKE ?', [`%${search.toLowerCase()}%`])
                    .orWhereRaw('LOWER(p."ParticipantFirstName") LIKE ?', [`%${search.toLowerCase()}%`])
                    .orWhereRaw('LOWER(p."ParticipantLastName") LIKE ?', [`%${search.toLowerCase()}%`])
                    .orWhereRaw('CAST(s."SurveyID" AS TEXT) LIKE ?', [`%${search}%`]);
            });
        }

        // Apply event filter
        if (filterEventID) {
            query = query.where('et.EventID', filterEventID);
        }

        // Apply date filters on event occurrence date
        if (filterStartDate) {
            query = query.where('eo.OccurrenceDate', '>=', filterStartDate);
        }
        if (filterEndDate) {
            query = query.where('eo.OccurrenceDate', '<=', filterEndDate);
        }

        const results = await query
            .select('s.SurveyNPSBucket as bucket')
            .count('* as count')
            .groupBy('s.SurveyNPSBucket')
            .orderByRaw(`
                CASE s."SurveyNPSBucket"
                    WHEN 'Promoter' THEN 1
                    WHEN 'Passive' THEN 2
                    WHEN 'Detractor' THEN 3
                    ELSE 4
                END
            `);

        res.json(results);
    } catch (err) {
        console.error('Survey NPS distribution error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/surveys-responses', async (req, res) => {
    try {
        const data = await knex('surveys')
        // Add your query
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// New participants by year (based on first event registration)
router.get('/participants-by-year', async (req, res) => {
    try {
        const data = await knex('Registration as r')
        .join('Participants as p', 'r.ParticipantID', 'p.ParticipantID')
        .select(knex.raw("EXTRACT(YEAR FROM MIN(r.\"RegistrationCreatedAt\")) as year"))
        .select('r.ParticipantID')
        .groupBy('r.ParticipantID')
        .then(results => {
            // Group by year and count participants
            const yearCounts = {};
            results.forEach(row => {
                const year = row.year;
                if (year) {
                    yearCounts[year] = (yearCounts[year] || 0) + 1;
                }
            });

            // Convert to array format for chart
            return Object.keys(yearCounts)
                .sort()
                .map(year => ({
                    year: year,
                    count: yearCounts[year]
                }));
        });

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Donations by month - with optional search/filter support
router.get('/donations-by-month', async (req, res) => {
    try {
        const { search, filterStartDate, filterEndDate, filterMinAmount, filterMaxAmount } = req.query;
        
        let query = knex('Participant_Donation as d')
            .leftJoin('Participants as p', 'd.ParticipantID', 'p.ParticipantID')
            .whereNotNull('d.DonationDate');

        // Apply search filter
        if (search) {
            query = query.where(function() {
                this.whereRaw('LOWER(p."ParticipantFirstName") LIKE ?', [`%${search.toLowerCase()}%`])
                    .orWhereRaw('LOWER(p."ParticipantLastName") LIKE ?', [`%${search.toLowerCase()}%`])
                    .orWhereRaw('LOWER(p."ParticipantEmail") LIKE ?', [`%${search.toLowerCase()}%`])
                    .orWhereRaw('CAST(d."DonationID" AS TEXT) LIKE ?', [`%${search}%`])
                    .orWhereRaw('CAST(d."DonationAmount" AS TEXT) LIKE ?', [`%${search}%`]);
            });
        }

        // Apply date filters
        if (filterStartDate) {
            query = query.where('d.DonationDate', '>=', filterStartDate);
        }
        if (filterEndDate) {
            query = query.where('d.DonationDate', '<=', filterEndDate);
        }

        // Apply amount filters
        if (filterMinAmount) {
            query = query.where('d.DonationAmount', '>=', parseFloat(filterMinAmount));
        }
        if (filterMaxAmount) {
            query = query.where('d.DonationAmount', '<=', parseFloat(filterMaxAmount));
        }

        const results = await query
            .select(knex.raw('EXTRACT(YEAR FROM d."DonationDate")::integer as year'))
            .select(knex.raw('EXTRACT(MONTH FROM d."DonationDate")::integer as month'))
            .sum('d.DonationAmount as total')
            .groupByRaw('EXTRACT(YEAR FROM d."DonationDate"), EXTRACT(MONTH FROM d."DonationDate")')
            .orderByRaw('year ASC, month ASC');

        res.json(results);
    } catch (err) {
        console.error('Donations by month error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;