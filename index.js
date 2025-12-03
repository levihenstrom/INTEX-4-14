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
    // Expose user and role information to all views
    res.locals.user = req.session.user || null;
    res.locals.userRole = req.session.userRole || null;
    res.locals.isAdmin = req.session.isAdmin || false;

     // Skip auth for public routes
    if (req.path === '/donations' || req.path === '/'|| req.path === '/login' || req.path === '/register' || req.path === '/logout') {
        return next();
    }

    // If logged in, continufe
    if (req.session.isLoggedIn) {
        return next();
    }

    // Not logged in → show login (ONE response, then stop)
    return res.status(418).render("login", { layout: 'public', pageTitle: 'Login', error_message: "Please log in to access this page" });
});


// // Helper middleware to require admin access
// const requireAdmin = (req, res, next) => {
//     if (!req.session.isLoggedIn || !req.session.isAdmin) {
//         return res.status(403).render('login', { 
//             layout: 'public', 
//             pageTitle: 'Access Denied',
//             error: 'Admin access required' 
//         });
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
        // Store user role: 'a' = admin, anything else = common user
        req.session.userRole = user.ParticipantRole || 'p';
        req.session.isAdmin = user.ParticipantRole === 'a';
    
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
        ParticipantZip,                 
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
        ParticipantZip,                   
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

app.get('/donations', async (req, res) => {
    try {
        if (req.session.isAdmin) {
            // Show ALL donations newest → oldest
            const donations = await knex('Participant_Donation')
            .join('Participants', 'Participant_Donation.ParticipantID', 'Participants.ParticipantID')
            .select(
                'Participant_Donation.DonationDate',
                'Participant_Donation.DonationAmount',
                'Participants.ParticipantEmail',
                'Participants.ParticipantFirstName',
                'Participants.ParticipantLastName'
            )
            .orderBy('Participant_Donation.DonationDate', 'desc');

            res.render('donations', {
            pageTitle: 'Donations',
            donations,
            });
        } else {
            // Show user donations newest → oldest
            const donations = await knex('Participant_Donation')
            .join('Participants', 'Participant_Donation.ParticipantID', 'Participants.ParticipantID')
            .select(
                'Participant_Donation.DonationDate',
                'Participant_Donation.DonationAmount',
                'Participants.ParticipantEmail',
                'Participants.ParticipantFirstName',
                'Participants.ParticipantLastName'
            )
            .where('Participants.ParticipantID', req.session.user.ParticipantID)
            .orderBy('Participant_Donation.DonationDate', 'desc');

            res.render('donations', {
            pageTitle: 'Donations',
            donations,
            });
        }
    } catch (err) {
        console.error('Error loading donations:', err);
        res.status(500).send('Error loading donations');
    }
});

app.get('/events', async (req, res) => {
    try {
        if (req.session.isAdmin) {
            // Show all events
            const events = await knex('Event_Occurrence')
            .join('Event_Templates', 'Event_Occurrence.EventID', 'Event_Templates.EventID')
            .select(
                'Event_Templates.EventName',
                'Event_Templates.EventType',
                'Event_Templates.EventDescription',
                'Event_Templates.EventRecurrencePattern',
                'Event_Templates.EventDefaultCapacity',
                'Event_Occurrence.EventDateTimeStart',
                'Event_Occurrence.EventDateTimeEnd',
                'Event_Occurrence.EventLocation',
                'Event_Occurrence.EventCapacity',
                'Event_Occurrence.EventRegistrationDeadline'
            )
            .orderBy('Event_Occurrence.EventDateTimeStart', 'asc');

            res.render('events', {
            pageTitle: 'Events',
            events,
            });
        } else {
            // Show future events
            const events = await knex('Event_Occurrence')
            .join('Event_Templates', 'Event_Occurrence.EventID', 'Event_Templates.EventID')
            .select(
                'Event_Templates.EventName',
                'Event_Templates.EventType',
                'Event_Templates.EventDescription',
                'Event_Templates.EventRecurrencePattern',
                'Event_Templates.EventDefaultCapacity',
                'Event_Occurrence.EventDateTimeStart',
                'Event_Occurrence.EventDateTimeEnd',
                'Event_Occurrence.EventLocation',
                'Event_Occurrence.EventCapacity',
                'Event_Occurrence.EventRegistrationDeadline'
            )
            .where('Event_Occurrence.EventDateTimeEnd', '>=', new Date())
            .orderBy('Event_Occurrence.EventDateTimeEnd', 'asc');

            res.render('events', {
            pageTitle: 'Events',
            events,
            });
        }
    } catch (err) {
        console.error('Error loading events:', err);
        res.status(500).send('Error loading events');
    }
});

app.get('/milestones', async (req, res) => {
    try {
        if (req.session.isAdmin) {
            // Show ALL milestones newest → oldest
            const milestones = await knex('Participant_Milestone')
            .join('Participants', 'Participant_Milestone.ParticipantID', 'Participants.ParticipantID')
            .select(
                'Participant_Milestone.MilestoneTitle',
                'Participant_Milestone.MilestoneDate',
                'Participants.ParticipantEmail',
                'Participants.ParticipantFirstName',
                'Participants.ParticipantLastName'
            )
            .orderBy('Participant_Milestone.MilestoneDate', 'desc');

            res.render('milestones', {
            pageTitle: 'Milestones',
            milestones,
            });
        } else {
            // Show user milestones newest → oldest
            const milestones = await knex('Participant_Milestone')
            .join('Participants', 'Participant_Milestone.ParticipantID', 'Participants.ParticipantID')
            .select(
                'Participant_Milestone.MilestoneTitle',
                'Participant_Milestone.MilestoneDate',
                'Participants.ParticipantEmail',
                'Participants.ParticipantFirstName',
                'Participants.ParticipantLastName'
            )
            .where('Participants.ParticipantID', req.session.user.ParticipantID)
            .orderBy('Participant_Milestone.MilestoneDate', 'desc');

            res.render('milestones', {
            pageTitle: 'Milestones',
            milestones,
            });
        }
    } catch (err) {
        console.error('Error loading milestones:', err);
        res.status(500).send('Error loading milestones');
    }
});

app.get('/surveys', async (req, res) => {
    try {
        if (req.session.isAdmin) {
            // Show ALL surveys newest → oldest
            const surveys = await knex('Surveys')
            .join('Registration', 'Surveys.RegistrationID', 'Registration.RegistrationID')
            .join('Participants', 'Registration.ParticipantID', 'Participants.ParticipantID')
            .join('Event_Occurrence', 'Registration.OccurrenceID', 'Event_Occurrence.OccurrenceID')
            .join('Event_Templates', 'Event_Occurrence.EventID', 'Event_Templates.EventID')
            .select(
                'Surveys.SurveyID',
                'Surveys.SurveySatisfactionScore',
                'Surveys.SurveyUsefulnessScore',
                'Surveys.SurveyInstructorScore',
                'Surveys.SurveyRecommendationScore',
                'Surveys.SurveyOverallScore',
                'Surveys.SurveyNPSBucket',
                'Surveys.SurveyComments',
                'Surveys.SurveySubmissionDate',
                'Participants.ParticipantEmail',
                'Participants.ParticipantFirstName',
                'Participants.ParticipantLastName',
                'Event_Templates.EventName',
                'Event_Occurrence.EventDateTimeStart'
            )
            .orderBy('Surveys.SurveySubmissionDate', 'desc');

            res.render('surveys', {
            pageTitle: 'Surveys',
            surveys,
            });
        } else {
            // Show user surveys newest → oldest
            const surveys = await knex('Surveys')
            .join('Registration', 'Surveys.RegistrationID', 'Registration.RegistrationID')
            .join('Participants', 'Registration.ParticipantID', 'Participants.ParticipantID')
            .join('Event_Occurrence', 'Registration.OccurrenceID', 'Event_Occurrence.OccurrenceID')
            .join('Event_Templates', 'Event_Occurrence.EventID', 'Event_Templates.EventID')
            .select(
                'Surveys.SurveyID',
                'Surveys.SurveySatisfactionScore',
                'Surveys.SurveyUsefulnessScore',
                'Surveys.SurveyInstructorScore',
                'Surveys.SurveyRecommendationScore',
                'Surveys.SurveyOverallScore',
                'Surveys.SurveyNPSBucket',
                'Surveys.SurveyComments',
                'Surveys.SurveySubmissionDate',
                'Participants.ParticipantEmail',
                'Participants.ParticipantFirstName',
                'Participants.ParticipantLastName',
                'Event_Templates.EventName',
                'Event_Occurrence.EventDateTimeStart'
            )
            .where('Participants.ParticipantID', req.session.user.ParticipantID)
            .orderBy('Surveys.SurveySubmissionDate', 'desc');

            res.render('surveys', {
            pageTitle: 'Surveys',
            surveys,
            });
        }
    } catch (err) {
        console.error('Error loading surveys:', err);
        res.status(500).send('Error loading surveys');
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


// GET /users
app.get('/users', async (req, res) => {
    if(req.session.isAdmin){
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = 50;
            const offset = (page - 1) * limit;
            const searchTerm = req.query.search || '';
            const sortColumn = req.query.sort || 'ParticipantID';
            const sortDir = req.query.sortDir || 'asc';

            // Validate sort column and direction
            const validColumns = ['ParticipantID', 'ParticipantFirstName', 'ParticipantLastName', 
                                'ParticipantSchoolOrEmployer', 'ParticipantRole'];
            const validSortDir = ['asc', 'desc'];
            const safeSortColumn = validColumns.includes(sortColumn) ? sortColumn : 'ParticipantID';
            const safeSortDir = validSortDir.includes(sortDir.toLowerCase()) ? sortDir.toLowerCase() : 'asc';

            // Build query with optional search
            let query = knex('Participants')
                .select('ParticipantID', 'ParticipantFirstName', 'ParticipantLastName', 
                        'ParticipantSchoolOrEmployer', 'ParticipantRole');

            // Add search conditions if search term exists
            if (searchTerm) {
                const searchPattern = `%${searchTerm}%`;
                query = query.where(function() {
                    this.whereRaw('CAST("ParticipantID" AS TEXT) ILIKE ?', [searchPattern])
                        .orWhere('ParticipantFirstName', 'ilike', searchPattern)
                        .orWhere('ParticipantLastName', 'ilike', searchPattern)
                        .orWhere('ParticipantSchoolOrEmployer', 'ilike', searchPattern)
                        .orWhereRaw('("ParticipantFirstName" || \' \' || "ParticipantLastName") ILIKE ?', [searchPattern]);
                });
            }

            // Get total count for pagination (with search filter)
            const countQuery = knex('Participants');
            if (searchTerm) {
                const searchPattern = `%${searchTerm}%`;
                countQuery.where(function() {
                    this.whereRaw('CAST("ParticipantID" AS TEXT) ILIKE ?', [searchPattern])
                        .orWhere('ParticipantFirstName', 'ilike', searchPattern)
                        .orWhere('ParticipantLastName', 'ilike', searchPattern)
                        .orWhere('ParticipantSchoolOrEmployer', 'ilike', searchPattern)
                        .orWhereRaw('("ParticipantFirstName" || \' \' || "ParticipantLastName") ILIKE ?', [searchPattern]);
                });
            }
            const totalCount = await countQuery.count('* as count').first();
            const totalUsers = parseInt(totalCount.count);
            const totalPages = Math.ceil(totalUsers / limit);

            // Pull user data from database with pagination, search, and sorting
            const users = await query
                .orderBy(safeSortColumn, safeSortDir)
                .limit(limit)
                .offset(offset);
            
            res.render('users', { 
                layout: 'public', 
                pageTitle: 'Users',
                users: users,
                currentPage: page,
                totalPages: totalPages,
                totalUsers: totalUsers,
                hasNextPage: page < totalPages,
                searchTerm: searchTerm,
                sortColumn: safeSortColumn,
                sortDir: safeSortDir,
                error: req.query.error || null
            });
        } catch (err) {
            console.error('Error fetching users:', err);
            return res.render('users', { 
                layout: 'public', 
                pageTitle: 'Users',
                users: [],
                error: 'Error loading users. Please try again.' 
            });
        }
    }
    else{
        // Return 418 status code for non-admin access attempt
        return res.status(418).render('landing', { 
            layout: 'public', 
            pageTitle: 'Welcome',
            error: 'You do not have admin access' 
        });
    }
});


// POST /users: Handle role updates
app.post('/users', async (req, res) => {
    if(!req.session.isAdmin){
        return res.status(418).render('landing', { 
            layout: 'public', 
            pageTitle: 'Welcome',
            error: 'You do not have admin access' 
        });
    }

    try {
        const { participantId, newRole, preserveSearch, preserveSort, preserveSortDir, preservePage } = req.body;
        
        // Validate role
        if (newRole !== 'a' && newRole !== 'p') {
            return res.status(400).json({ error: 'Invalid role' });
        }

        // Update participant role
        await knex('Participants')
            .where('ParticipantID', participantId)
            .update({ ParticipantRole: newRole });

        // Build redirect URL with preserved parameters
        let redirectUrl = '/users?';
        const params = [];
        if (preserveSearch) params.push('search=' + encodeURIComponent(preserveSearch));
        if (preserveSort) params.push('sort=' + encodeURIComponent(preserveSort));
        if (preserveSortDir) params.push('sortDir=' + encodeURIComponent(preserveSortDir));
        if (preservePage) params.push('page=' + encodeURIComponent(preservePage));
        
        if (params.length > 0) {
            redirectUrl += params.join('&');
        } else {
            redirectUrl = '/users';
        }

        return res.redirect(redirectUrl);
    } catch (err) {
        console.error('Error updating user role:', err);
        return res.status(500).json({ error: 'Error updating user role' });
    }
});

// POST /users/delete: Handle user deletion
app.post('/users/delete', async (req, res) => {
    if(!req.session.isAdmin){
        return res.status(418).render('landing', { 
            layout: 'public', 
            pageTitle: 'Welcome',
            error: 'You do not have admin access' 
        });
    }

    try {
        const { participantId, preserveSearch, preserveSort, preserveSortDir, preservePage } = req.body;
        
        if (!participantId) {
            return res.status(400).json({ error: 'Participant ID required' });
        }

        // Delete participant
        await knex('Participants')
            .where('ParticipantID', participantId)
            .del();

        // Build redirect URL with preserved parameters
        let redirectUrl = '/users?';
        const params = [];
        if (preserveSearch) params.push('search=' + encodeURIComponent(preserveSearch));
        if (preserveSort) params.push('sort=' + encodeURIComponent(preserveSort));
        if (preserveSortDir) params.push('sortDir=' + encodeURIComponent(preserveSortDir));
        if (preservePage) params.push('page=' + encodeURIComponent(preservePage));
        
        if (params.length > 0) {
            redirectUrl += params.join('&');
        } else {
            redirectUrl = '/users';
        }

        return res.redirect(redirectUrl);
    } catch (err) {
        console.error('Error deleting user:', err);
        return res.status(500).json({ error: 'Error deleting user' });
    }
});

// POST /users/add: Handle new user creation by admin
app.post('/users/add', async (req, res) => {
    if(!req.session.isAdmin){
        return res.status(418).render('landing', { 
            layout: 'public', 
            pageTitle: 'Welcome',
            error: 'You do not have admin access' 
        });
    }

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
            ParticipantFieldOfInterest,
            ParticipantRole
        } = req.body;

        // Validate required fields
        if (!ParticipantEmail || !ParticipantPassword || !ParticipantFirstName || !ParticipantLastName || !ParticipantDOB) {
            return res.redirect('/users?error=' + encodeURIComponent('All required fields must be filled'));
        }

        // Validate role
        const roleToUse = (ParticipantRole === 'a') ? 'a' : 'p';

        // Check if email already exists
        const existingParticipant = await knex('Participants')
            .where('ParticipantEmail', ParticipantEmail)
            .first();

        if (existingParticipant) {
            return res.redirect('/users?error=' + encodeURIComponent('An account with that email already exists'));
        }

        // Insert new participant
        await knex('Participants').insert({
            ParticipantEmail,
            ParticipantPassword,
            ParticipantFirstName,
            ParticipantLastName,
            ParticipantDOB,
            ParticipantPhone: ParticipantPhone || null,
            ParticipantCity: ParticipantCity || null,
            ParticipantState: ParticipantState || null,
            ParticipantZip: ParticipantZip || null,
            ParticipantSchoolOrEmployer: ParticipantSchoolOrEmployer || null,
            ParticipantFieldOfInterest: ParticipantFieldOfInterest || null,
            ParticipantRole: roleToUse
        });

        return res.redirect('/users');
    } catch (err) {
        console.error('Error creating user:', err);
        return res.redirect('/users?error=' + encodeURIComponent('Error creating user. Please try again.'));
    }
});




// 6. Start Server
app.listen(port, () => {
    console.log(`INTEX server listening at port:${port}`);
});