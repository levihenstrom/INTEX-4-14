const express = require('express');
const router = express.Router();
const knex = require('knex')(require('../knexfile').development);

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

// Milestones data endpoints
router.get('/milestones-by-category', async (req, res) => {
    try {
        const results = await knex.raw(`
            SELECT
                "MilestoneCategory" as category,
                COUNT(*) as count
            FROM "Participant_Milestone"
            WHERE "MilestoneCategory" IS NOT NULL AND "MilestoneCategory" != ''
            GROUP BY "MilestoneCategory"
            ORDER BY count DESC
        `);
        res.json(results.rows);
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

// Survey NPS distribution for stacked bar chart
router.get('/surveys-nps-distribution', async (req, res) => {
    try {
        const results = await knex.raw(`
            SELECT
                "SurveyNPSBucket" as bucket,
                COUNT(*) as count
            FROM "Surveys"
            WHERE "SurveyNPSBucket" IS NOT NULL AND "SurveyNPSBucket" != ''
            GROUP BY "SurveyNPSBucket"
            ORDER BY 
                CASE "SurveyNPSBucket"
                    WHEN 'Promoter' THEN 1
                    WHEN 'Passive' THEN 2
                    WHEN 'Detractor' THEN 3
                    ELSE 4
                END
        `);
        res.json(results.rows);
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

// Donations by month
router.get('/donations-by-month', async (req, res) => {
    try {
        // First, let's check what columns exist
        const testQuery = await knex('Participant_Donation').limit(1);
        console.log('Sample donation record:', testQuery[0]);

        const results = await knex.raw(`
            SELECT
                EXTRACT(YEAR FROM "DonationDate")::integer as year,
                EXTRACT(MONTH FROM "DonationDate")::integer as month,
                SUM("DonationAmount") as total
            FROM "Participant_Donation"
            WHERE "DonationDate" IS NOT NULL
            GROUP BY EXTRACT(YEAR FROM "DonationDate"), EXTRACT(MONTH FROM "DonationDate")
            ORDER BY year ASC, month ASC
        `);

        console.log('Query results:', results.rows);
        res.json(results.rows);
    } catch (err) {
        console.error('Donations by month error:', err);
        console.error('Error stack:', err.stack);
        res.status(500).json({ error: err.message, stack: err.stack });
    }
});

module.exports = router;