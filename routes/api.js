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
        const data = await knex('milestones')
        .select('category')
        .count('* as count')
        .groupBy('category');
        res.json(data);
    } catch (err) {
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

// Donations data endpoints
router.get('/donations-by-month', async (req, res) => {
    try {
        const data = await knex('donations')
        // Add your query for monthly totals
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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

router.get('/surveys-responses', async (req, res) => {
    try {
        const data = await knex('surveys')
        // Add your query
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;