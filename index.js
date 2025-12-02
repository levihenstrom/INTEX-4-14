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

// Simple date format helpers for profile views
const formatDateForDisplay = (dateValue) => {
    if (!dateValue) return null;
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return null;
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
};

const formatDateForInput = (dateValue) => {
    if (!dateValue) return null;
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return null;
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${year}-${month}-${day}`;
};

const calculateAge = (dateValue) => {
    if (!dateValue) return null;
    const birthDate = new Date(dateValue);
    if (Number.isNaN(birthDate.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
};

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
            const validColumns = [
                'ParticipantID',
                'ParticipantFirstName',
                'ParticipantLastName',
                'ParticipantEmail',
                'ParticipantSchoolOrEmployer',
                'ParticipantCity',
                'ParticipantState',
                'ParticipantRole'
            ];
            const validSortDir = ['asc', 'desc'];
            const safeSortColumn = validColumns.includes(sortColumn) ? sortColumn : 'ParticipantID';
            const safeSortDir = validSortDir.includes(sortDir.toLowerCase()) ? sortDir.toLowerCase() : 'asc';

            // Build query with optional search
            let query = knex('Participants')
                .select(
                    'ParticipantID',
                    'ParticipantFirstName',
                    'ParticipantLastName',
                    'ParticipantEmail',
                    'ParticipantDOB',
                    'ParticipantPhone',
                    'ParticipantCity',
                    'ParticipantState',
                    'ParticipantZip',
                    'ParticipantSchoolOrEmployer',
                    'ParticipantFieldOfInterest',
                    'ParticipantRole'
                );

            // Add search conditions if search term exists
            if (searchTerm) {
                const searchPattern = `%${searchTerm}%`;
                query = query.where(function() {
                    this.whereRaw('CAST("ParticipantID" AS TEXT) ILIKE ?', [searchPattern])
                        .orWhere('ParticipantFirstName', 'ilike', searchPattern)
                        .orWhere('ParticipantLastName', 'ilike', searchPattern)
                        .orWhere('ParticipantEmail', 'ilike', searchPattern)
                        .orWhere('ParticipantSchoolOrEmployer', 'ilike', searchPattern)
                        .orWhere('ParticipantCity', 'ilike', searchPattern)
                        .orWhere('ParticipantState', 'ilike', searchPattern)
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
                        .orWhere('ParticipantEmail', 'ilike', searchPattern)
                        .orWhere('ParticipantSchoolOrEmployer', 'ilike', searchPattern)
                        .orWhere('ParticipantCity', 'ilike', searchPattern)
                        .orWhere('ParticipantState', 'ilike', searchPattern)
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
                error: req.query.error || null,
                success: req.query.success || null
            });
        } catch (err) {
            console.error('Error fetching users:', err);
            return res.render('users', { 
                layout: 'public', 
                pageTitle: 'Users',
                users: [],
                error: 'Error loading users. Please try again.',
                success: null
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

        return res.redirect('/users?success=' + encodeURIComponent('User successfully added.'));
    } catch (err) {
        console.error('Error creating user:', err);
        return res.redirect('/users?error=' + encodeURIComponent('Error creating user. Please try again.'));
    }
});

//GET /profile
app.get('/profile', async (req, res) => {
        // Regular user view: show only their own data
        try {
            const participantId = req.session.user.ParticipantID;
            const participantPromise = knex('Participants')
                .where('ParticipantID', participantId)
                .first();
            const totalEventsPromise = knex('Registration')
                .where('ParticipantID', participantId)
                .andWhere('RegistrationAttendedFlag', true)
                .count('RegistrationID as count')
                .first();
            const recentMilestonePromise = knex('Participant_Milestone')
                .where('ParticipantID', participantId)
                .orderBy('MilestoneDate', 'desc')
                .orderBy('MilestoneID', 'desc')
                .first();
            const donationSumPromise = knex('Participant_Donation')
                .where('ParticipantID', participantId)
                .sum('DonationAmount as total')
                .first();

            const [participant, totalEventsRow, recentMilestone, donationSumRow] = await Promise.all([
                participantPromise,
                totalEventsPromise,
                recentMilestonePromise,
                donationSumPromise
            ]);
            
            if (!participant) {
                return res.render('profile', { 
                    layout: 'public', 
                    pageTitle: 'Profile',
                    participant: null,
                    error: 'Profile not found.',
                    profileDOBDisplay: null,
                    profileDOBInput: null
                });
            }

            const totalEventsAttended = parseInt(totalEventsRow?.count, 10) || 0;
            const totalDonations = parseFloat(donationSumRow?.total) || 0;
            const totalDonationsDisplay = totalDonations.toFixed(2);
            const profileDOBDisplay = formatDateForDisplay(participant.ParticipantDOB);
            const profileDOBInput = formatDateForInput(participant.ParticipantDOB);

            res.render('profile', { 
                layout: 'public', 
                pageTitle: 'My Profile',
                participant,
                metrics: {
                    totalEventsAttended,
                    recentMilestone,
                    totalDonations,
                    totalDonationsDisplay
                },
                profileDOBDisplay,
                profileDOBInput
            });
        } catch (err) {
            console.error('Error fetching profile:', err);
            return res.render('/', { 
                layout: 'public', 
                pageTitle: 'Home',
                participant: null,
                error: 'Error loading your profile. Please try again.',
                profileDOBDisplay: null,
                profileDOBInput: null
            });
        }
});


// GET /participants
app.get('/participants', async (req, res) => {
    // Already checked for login by middleware
    if(req.session.isAdmin){
        // Admin view: show all participants with management
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = 50;
            const offset = (page - 1) * limit;
            const searchTerm = req.query.search || '';
            const sortColumn = req.query.sort || 'ParticipantID';
            const sortDir = req.query.sortDir || 'asc';

            // Validate sort column and direction
            const validColumns = ['ParticipantID', 'ParticipantFirstName', 'ParticipantLastName', 'ParticipantDOB',
                                 'ParticipantSchoolOrEmployer', 'ParticipantRole', 'ParticipantEmail', 
                                 'ParticipantCity', 'ParticipantState', 'ParticipantPhone', 'ParticipantFieldOfInterest'];
            const validSortDir = ['asc', 'desc'];
            const safeSortColumn = validColumns.includes(sortColumn) ? sortColumn : 'ParticipantID';
            const safeSortDir = validSortDir.includes(sortDir.toLowerCase()) ? sortDir.toLowerCase() : 'asc';

            // Build query with optional search
            let query = knex('Participants')
                .select('ParticipantID', 'ParticipantFirstName', 'ParticipantLastName', 
                        'ParticipantEmail', 'ParticipantDOB', 'ParticipantPhone',
                        'ParticipantCity', 'ParticipantState', 'ParticipantZip',
                        'ParticipantSchoolOrEmployer', 'ParticipantFieldOfInterest', 'ParticipantRole');

            // Add search conditions if search term exists
            if (searchTerm) {
                const searchPattern = `%${searchTerm}%`;
                query = query.where(function() {
                    this.whereRaw('CAST("ParticipantID" AS TEXT) ILIKE ?', [searchPattern])
                        .orWhere('ParticipantFirstName', 'ilike', searchPattern)
                        .orWhere('ParticipantLastName', 'ilike', searchPattern)
                        .orWhere('ParticipantEmail', 'ilike', searchPattern)
                        .orWhere('ParticipantSchoolOrEmployer', 'ilike', searchPattern)
                        .orWhere('ParticipantCity', 'ilike', searchPattern)
                        .orWhere('ParticipantPhone', 'ilike', searchPattern)
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
                        .orWhere('ParticipantEmail', 'ilike', searchPattern)
                        .orWhere('ParticipantSchoolOrEmployer', 'ilike', searchPattern)
                        .orWhere('ParticipantCity', 'ilike', searchPattern)
                        .orWhere('ParticipantPhone', 'ilike', searchPattern)
                        .orWhereRaw('("ParticipantFirstName" || \' \' || "ParticipantLastName") ILIKE ?', [searchPattern]);
                });
            }
            const totalCount = await countQuery.count('* as count').first();
            const totalUsers = parseInt(totalCount.count);
            const totalPages = Math.ceil(totalUsers / limit);

            // Pull participant data from database with pagination, search, and sorting
            const participants = await query
                .orderBy(safeSortColumn, safeSortDir)
                .limit(limit)
                .offset(offset);

            const participantsWithAge = participants.map(participant => ({
                ...participant,
                ParticipantAge: calculateAge(participant.ParticipantDOB)
            }));
            
            res.render('participants', { 
                layout: 'public', 
                pageTitle: 'Participants',
                participants: participantsWithAge,
                currentPage: page,
                totalPages: totalPages,
                totalUsers: totalUsers,
                hasNextPage: page < totalPages,
                searchTerm: searchTerm,
                sortColumn: safeSortColumn,
                sortDir: safeSortDir,
                error: req.query.error || null,
                success: req.query.success || null,
                profileDOBDisplay: null,
                profileDOBInput: null
            });
        } catch (err) {
            console.error('Error fetching participants:', err);
            return res.render('participants', { 
                layout: 'public', 
                pageTitle: 'Participants',
                participants: [],
                error: 'Error loading participants. Please try again.',
                success: null,
                profileDOBDisplay: null,
                profileDOBInput: null
            });
        }
    } 
});

// POST /participants: Handle participant updates
app.post('/participants', async (req, res) => {
    try {
        const { 
            participantId,
            ParticipantFirstName, 
            ParticipantLastName, 
            ParticipantDOB, 
            ParticipantPhone, 
            ParticipantCity, 
            ParticipantState, 
            ParticipantZip,
            ParticipantSchoolOrEmployer,
            ParticipantFieldOfInterest,
            preserveSearch,
            preserveSort,
            preserveSortDir,
            preservePage,
            redirectTo
        } = req.body;

        // Determine which participant to update
        let targetParticipantId;
        if (req.session.isAdmin) {
            // Admin can update any participant
            if (!participantId) {
                return res.status(400).json({ error: 'Participant ID required' });
            }
            targetParticipantId = participantId;
        } else {
            // Regular user can only update their own profile
            targetParticipantId = req.session.user.ParticipantID;
        }

        // Update participant
        await knex('Participants')
            .where('ParticipantID', targetParticipantId)
            .update({
                ParticipantFirstName,
                ParticipantLastName,
                ParticipantDOB: ParticipantDOB || null,
                ParticipantPhone: ParticipantPhone || null,
                ParticipantCity: ParticipantCity || null,
                ParticipantState: ParticipantState || null,
                ParticipantZip: ParticipantZip || null,
                ParticipantSchoolOrEmployer: ParticipantSchoolOrEmployer || null,
                ParticipantFieldOfInterest: ParticipantFieldOfInterest || null
            });

        // Build redirect URL
        if (req.session.isAdmin) {
            if (redirectTo) {
                return res.redirect(redirectTo);
            }
            let redirectUrl = '/participants?';
            const params = [];
            if (preserveSearch) params.push('search=' + encodeURIComponent(preserveSearch));
            if (preserveSort) params.push('sort=' + encodeURIComponent(preserveSort));
            if (preserveSortDir) params.push('sortDir=' + encodeURIComponent(preserveSortDir));
            if (preservePage) params.push('page=' + encodeURIComponent(preservePage));
            
            if (params.length > 0) {
                redirectUrl += params.join('&');
            } else {
                redirectUrl = '/participants';
            }
            return res.redirect(redirectUrl);
        } else {
            return res.redirect('/participants');
        }
    } catch (err) {
        console.error('Error updating participant:', err);
        if (req.session.isAdmin) {
            return res.redirect('/participants?error=' + encodeURIComponent('Error updating participant. Please try again.'));
        } else {
            return res.redirect('/participants?error=' + encodeURIComponent('Error updating your profile. Please try again.'));
        }
    }
});

// POST /participants/delete: Handle participant deletion (admin only)
app.post('/participants/delete', async (req, res) => {
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
        let redirectUrl = '/participants?';
        const params = [];
        if (preserveSearch) params.push('search=' + encodeURIComponent(preserveSearch));
        if (preserveSort) params.push('sort=' + encodeURIComponent(preserveSort));
        if (preserveSortDir) params.push('sortDir=' + encodeURIComponent(preserveSortDir));
        if (preservePage) params.push('page=' + encodeURIComponent(preservePage));
        
        if (params.length > 0) {
            redirectUrl += params.join('&');
        } else {
            redirectUrl = '/participants';
        }

        return res.redirect(redirectUrl);
    } catch (err) {
        console.error('Error deleting participant:', err);
        return res.status(500).json({ error: 'Error deleting participant' });
    }
});

// POST /participants/add: Handle new participant creation by admin
app.post('/participants/add', async (req, res) => {
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

        if (!ParticipantEmail || !ParticipantFirstName || !ParticipantLastName || !ParticipantDOB) {
            return res.redirect('/participants?error=' + encodeURIComponent('All required fields must be filled.'));
        }

        const roleToUse = ParticipantRole === 'a' ? 'a' : 'p';

        const existingParticipant = await knex('Participants')
            .where('ParticipantEmail', ParticipantEmail)
            .first();

        if (existingParticipant) {
            return res.redirect('/participants?error=' + encodeURIComponent('An account with that email already exists'));
        }

        await knex('Participants').insert({
            ParticipantEmail,
            ParticipantPassword: ParticipantPassword || null,
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

        return res.redirect('/participants?success=' + encodeURIComponent('Participant successfully added.'));
    } catch (err) {
        console.error('Error creating participant:', err);
        return res.redirect('/participants?error=' + encodeURIComponent('Error creating participant. Please try again.'));
    }
});

// 6. Start Server
app.listen(port, () => {
    console.log(`INTEX server listening at port:${port}`);
});
