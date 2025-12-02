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
    cookie: { secure: false } // Set to true in production with HTTPS
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

     // Skip auth for public routes
    if (req.path === '/'|| req.path === '/login' || req.path === '/register' || req.path === '/logout') {
        return next();
    }

    // If logged in, continufe
    if (req.session.isLoggedIn) {
        return next();
    }

    // Not logged in → show login (ONE response, then stop)
    return res.render("login", { layout: 'public', pageTitle: 'Login', error_message: "Please log in to access this page" });
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
    res.render('landing', { layout: 'public', pageTitle: 'Welcome' });
});

// GET /login: Show login form
app.get('/login', (req, res) => {
    res.render('login', { layout: 'public', pageTitle: 'Login' });
});

app.post('/login', async (req, res) => {
        const { ParticipantEmail, ParticipantPassword} = req.body;
    
        try {
        // Get full user row so session has everything
        const user = await knex('Participants')
            .where({ParticipantEmail, ParticipantPassword})
            .first();
    
        if (!user) {
            return res.render('login', { 
            layout: 'public', 
            pageTitle: 'Login',
            error: 'Invalid login' 
            });
        }
    
        req.session.isLoggedIn = true;
        req.session.user = user;
    
        return res.redirect('/');
        } catch (err) {
        console.error('Login error:', err);
        return res.render('login', { 
            layout: 'public', 
            pageTitle: 'Login',
            error: 'Something went wrong. Please try again.' 
        });
        }
});
    
  // GET /register: Show registration form
app.get('/register', (req, res) => {
    res.render('register', { 
    layout: 'public',
    pageTitle: 'Register',
    error: null
    });
});

// POST /register: Handle registration attempt 
app.post('/register', async (req, res) => {
try {
    const { 
    ParticipantEmail, 
    ParticipantPassword, 
    ParticipantFirstName, 
    ParticipantLastName, 
    ParticipantDOB, 
    ParticipantPhone, 
    ParticipantCity, 
    ParticipantState, 
    ParticipantZip,
    ParticipantSchoolOrEmployer,
    ParticipantFieldOfInterest
    } = req.body;

    // 1. Look for existing participant by email
    const existingParticipant = await knex('Participants')
    .where('ParticipantEmail', ParticipantEmail)
    .first();

    // 2. If email exists & password is already set → block registration
    if (existingParticipant && existingParticipant.ParticipantPassword) {
    return res.render('register', {
        layout: 'public',
        pageTitle: 'Register',
        error: 'An account with that email already exists. Please log in.'
    });
    }

    // --- ROLE DEFAULT LOGIC ---
    // Keep their role if they already have one. Otherwise default to 'p'.
    const roleToUse = existingParticipant?.ParticipantRole || 'p';

    // 3. Upgrade a visitor row (email exists but password is NULL)
    if (existingParticipant && !existingParticipant.ParticipantPassword) {
    await knex('Participants')
        .where('ParticipantID', existingParticipant.ParticipantID)
        .update({
        ParticipantPassword,
        ParticipantFirstName,
        ParticipantLastName,
        ParticipantDOB,
        ParticipantPhone,
        ParticipantCity,
        ParticipantState,
        ParticipantZip,                  // <-- added ZIP
        ParticipantSchoolOrEmployer,
        ParticipantFieldOfInterest,
        ParticipantRole: roleToUse       // <-- apply default
        });
    }

    // 4. Insert a brand new participant row
    else if (!existingParticipant) {
    await knex('Participants').insert({
        ParticipantEmail,
        ParticipantPassword,
        ParticipantFirstName,
        ParticipantLastName,
        ParticipantDOB,
        ParticipantPhone,
        ParticipantCity,
        ParticipantState,
        ParticipantZip,                    // <-- added ZIP
        ParticipantSchoolOrEmployer,
        ParticipantFieldOfInterest,
        ParticipantRole: roleToUse         // <-- default to 'p'
    });
}

    // 5. Redirect on success
    return res.redirect('/login');

} catch (err) {
    console.error('Registration error:', err);

    return res.render('register', {
    layout: 'public',
    pageTitle: 'Register',
    error: 'Something went wrong. Please try again.'
    });
}
});

    
    
// GET /logout
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/dashboard'); // Fallback
        }
        res.clearCookie('connect.sid'); // Clear session cookie
        res.redirect('/');
    });
});



// 6. Start Server
app.listen(port, () => {
    console.log(`INTEX server listening at port:${port}`);
});