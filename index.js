// 1. Module Imports
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
// const { Pool } = require('pg'); // For Database Engineer - Alex

// 2. Initial Setup
const app = express();
const port = process.env.PORT || 3000;

// 3. knex Configuration
const knexConfig = require("./knexfile");
const environment = process.env.NODE_ENV || "development";
const knex = require("knex")(knexConfig[environment]);

// 4. Middleware Configuration
app.use(express.urlencoded({ extended: true })); // Handle form submissions
app.use(express.json()); // Handle JSON data
app.use(express.static('public')); // Serve static files (CSS, images)

// Session/Authentication Setup (Authentication Specialist - Levi)
app.use(session({
    secret: 'a_very_secret_key_for_intex', // CHANGE THIS IN PRODUCTION
    resave: false,
    saveUninitialized: false,
    cookie: { secure: true } // Set to true in production with HTTPS
}));

// EJS View Engine Setup
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.use(expressLayouts);
app.set('layout', 'public'); // Sets 'public.ejs' as the default layout

// Middleware to expose user to all EJS views
app.use((req, res, next) => {
    // This is a placeholder for actual session/auth data
    res.locals.user = req.session.user || null;
    next();
});


// Simple Auth Check Middleware
// const requireLogin = (req, res, next) => {
//     if (!req.session.user) {
//         // Redirect unauthenticated users
//         return res.redirect('/login');
//     }
//     next();
// };

// 5. Routes

// Public Routes (Handles landing, login, register)
// GET /: Landing page
app.get('/', (req, res) => {
    // If user is logged in, redirect to dashboard
    // if (req.session.user) {
    //     return res.redirect('/dashboard');
    // }
    // Renders the public landing page
    res.render('landing', { layout: 'public' });
});

// GET /login: Show login form
// app.get('/login', (req, res) => {
//     res.render('login', { layout: 'public' });
// });

// 6. Start Server
app.listen(port, () => {
    console.log(`INTEX server listening at port:${port}`);
});