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

const formatMonthYear = (dateValue) => {
    if (!dateValue) return null;
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
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

const determineNpsBucket = (recommendationScore) => {
    const score = parseInt(recommendationScore, 10);
    if (Number.isNaN(score)) return null;
    if (score >= 4) return 'Promoter';
    if (score === 3) return 'Passive';
    return 'Detractor';
};

const clampSurveyScore = (value) => {
    const score = parseInt(value, 10);
    if (Number.isNaN(score)) {
        return null;
    }
    if (score < 0) return 0;
    if (score > 5) return 5;
    return score;
};

const computeSurveyAverage = (scores) => {
    if (!Array.isArray(scores) || scores.length === 0) return null;
    const validScores = scores.filter((score) => typeof score === 'number');
    if (!validScores.length) return null;
    const sum = validScores.reduce((acc, val) => acc + val, 0);
    return parseFloat((sum / validScores.length).toFixed(2));
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
    const openPaths = [
        '/donations',
        '/',
        '/login',
        '/register',
        '/logout',
        '/donations/add/visitor',
        '/info',
        '/volunteer'
    ]
    if (openPaths.includes(req.path)) {
        return next();
    }

    // If logged in, continufe
    if (req.session.isLoggedIn) {
        return next();
    }

    // Not logged in → show login (ONE response, then stop)
    return res.status(418).render("login", {
        layout: 'public',
        pageTitle: 'Login',
        defaultView: 'login',
        isVolunteer: false,
        hasHero: false,
        error: "Please log in to access this page"
    });
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
app.get('/', async (req, res) => {
    try {
        // Get top 3 upcoming events
        const now = new Date();
        const upcomingOccurrences = await knex('Event_Occurrence as eo')
            .join('Event_Templates as et', 'eo.EventID', 'et.EventID')
            .leftJoin('Registration as r', 'eo.OccurrenceID', 'r.OccurrenceID')
            .select(
                'eo.OccurrenceID',
                'eo.EventID',
                'eo.EventDateTimeStart',
                'eo.EventDateTimeEnd',
                'eo.EventLocation',
                'eo.EventCapacity',
                'eo.EventRegistrationDeadline',
                'et.EventName',
                'et.EventType',
                'et.EventDescription',
                'et.EventRecurrencePattern',
                'et.EventDefaultCapacity',
                knex.raw('COALESCE(COUNT(DISTINCT "r"."RegistrationID"), 0) as registration_count')
            )
            .where('eo.EventDateTimeStart', '>=', knex.fn.now())
            .groupBy(
                'eo.OccurrenceID',
                'eo.EventID',
                'eo.EventDateTimeStart',
                'eo.EventDateTimeEnd',
                'eo.EventLocation',
                'eo.EventCapacity',
                'eo.EventRegistrationDeadline',
                'et.EventName',
                'et.EventType',
                'et.EventDescription',
                'et.EventRecurrencePattern',
                'et.EventDefaultCapacity'
            )
            .orderBy('eo.EventDateTimeStart', 'asc')
            .limit(3);

        // Calculate if each occurrence is full
        const upcomingEvents = upcomingOccurrences.map(occurrence => {
            const capacity = occurrence.EventCapacity || occurrence.EventDefaultCapacity;
            let registrationCount = 0;
            if (occurrence.registration_count !== null && occurrence.registration_count !== undefined) {
                registrationCount = typeof occurrence.registration_count === 'string' 
                    ? parseInt(occurrence.registration_count, 10) 
                    : Number(occurrence.registration_count);
                if (isNaN(registrationCount)) registrationCount = 0;
            }
            const isFull = capacity ? registrationCount >= capacity : false;
            
            return {
                ...occurrence,
                registrationCount,
                isFull,
                hasSpace: !isFull
            };
        });

        res.render('landing', { 
            layout: 'public',
            pageTitle: 'Welcome',
            hasHero: true,
            upcomingEvents: upcomingEvents || []
        });
    } catch (err) {
        console.error('Error loading landing page:', err);
        res.render('landing', { 
            layout: 'public',
            pageTitle: 'Welcome',
            hasHero: true,
            upcomingEvents: []
        });
    }
});

// GET /login: Show login form
app.get('/login', (req, res) => {
    res.render('login', { layout: 'public', pageTitle: 'Login', defaultView: 'login', isVolunteer: false });
});

app.get('/volunteer', (req, res) => {
    res.render('login', { layout: 'public', pageTitle: 'Login', defaultView: 'register', isVolunteer: true });
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
            defaultView: 'login',
            isVolunteer: false,
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
            defaultView: 'login',
            isVolunteer: false,
            error: 'Something went wrong. Please try again.' 
        });
        }
});
    
  // GET /register: Show registration form
app.get('/register', (req, res) => {
    res.render('login', { 
    layout: 'public',
    pageTitle: 'Register',
    defaultView: 'register',
    isVolunteer: false,
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
    ParticipantFieldOfInterest,
    ParticipantRole,
    } = req.body;

    // 1. Look for existing participant by email
    const existingParticipant = await knex('Participants')
    .where('ParticipantEmail', ParticipantEmail)
    .first();

    // 2. If email exists & password is already set → block registration
    if (existingParticipant && existingParticipant.ParticipantPassword) {
    return res.render('login', {
        layout: 'public',
        pageTitle: 'Register',
        defaultView: 'register',
        isVolunteer: false,
        error: 'An account with that email already exists. Please log in.'
    });
    }

    // --- ROLE DEFAULT LOGIC ---
    // Keep their role if they already have one. Otherwise default to 'p'.
    const roleToUse = existingParticipant?.ParticipantRole || ParticipantRole;

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

    return res.render('login', {
    layout: 'public',
    pageTitle: 'Register',
    defaultView: 'register',
    isVolunteer: false,
    error: 'Something went wrong. Please try again.'
    });
}
});

app.get('/donations', async (req, res) => {
    try {
        const searchTerm = (req.query.search || '').trim();
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = 50;
        const filterParticipantID = req.query.filterParticipantID || '';
        const filterDonationID = req.query.filterDonationID || '';
        const filterStartDate = req.query.filterStartDate || '';
        const filterEndDate = req.query.filterEndDate || '';
        const filterMinAge = req.query.filterMinAge || '';
        const filterMaxAge = req.query.filterMaxAge || '';
        const filterCity = req.query.filterCity || '';
        const filterState = req.query.filterState || '';
        const filterRole = req.query.filterRole || '';
        const filterInterest = req.query.filterInterest || '';
        const filterMinAmount = req.query.filterMinAmount || '';
        const filterMaxAmount = req.query.filterMaxAmount || '';
        const sortColumn = req.query.sort || 'DonationDate';
        const sortDir = (req.query.sortDir || 'desc').toLowerCase();

        const user = req.session.user || null;

        const baseQuery = knex('Participant_Donation as pd')
            .join('Participants as p', 'pd.ParticipantID', 'p.ParticipantID');

        if (!req.session.isAdmin && req.session.isLoggedIn) {
            baseQuery.where('p.ParticipantID', req.session.user.ParticipantID);
        }

        const filteredQuery = baseQuery.clone();

        if (searchTerm) {
            const searchPattern = `%${searchTerm}%`;
            filteredQuery.andWhere(function () {
                this.where('p.ParticipantFirstName', 'ilike', searchPattern)
                    .orWhere('p.ParticipantLastName', 'ilike', searchPattern)
                    .orWhere('p.ParticipantEmail', 'ilike', searchPattern)
                    .orWhereRaw("(\"p\".\"ParticipantFirstName\" || ' ' || \"p\".\"ParticipantLastName\") ILIKE ?", [searchPattern])
                    .orWhereRaw('CAST(pd."DonationID" AS TEXT) ILIKE ?', [searchPattern])
                    .orWhereRaw('CAST(pd."DonationAmount" AS TEXT) ILIKE ?', [searchPattern])
                    .orWhereRaw('CAST(pd."DonationDate" AS TEXT) ILIKE ?', [searchPattern]);
            });
        }
        if (filterParticipantID) {
            filteredQuery.andWhere('pd.ParticipantID', filterParticipantID);
        }
        if (filterDonationID) {
            filteredQuery.andWhere('pd.DonationID', filterDonationID);
        }

        if (filterStartDate) {
            filteredQuery.andWhere('pd.DonationDate', '>=', filterStartDate);
        }
        if (filterEndDate) {
            filteredQuery.andWhere('pd.DonationDate', '<=', filterEndDate);
        }
        if (filterMinAmount) {
            const minAmount = parseFloat(filterMinAmount);
            if (!Number.isNaN(minAmount)) {
                filteredQuery.andWhere('pd.DonationAmount', '>=', minAmount);
            }
        }
        if (filterMaxAmount) {
            const maxAmount = parseFloat(filterMaxAmount);
            if (!Number.isNaN(maxAmount)) {
                filteredQuery.andWhere('pd.DonationAmount', '<=', maxAmount);
            }
        }

        const today = new Date();
        if (filterMinAge || filterMaxAge) {
            filteredQuery.whereNotNull('p.ParticipantDOB');
        }
        if (filterMinAge) {
            const cutoff = new Date(today);
            cutoff.setFullYear(cutoff.getFullYear() - parseInt(filterMinAge, 10));
            filteredQuery.andWhere('p.ParticipantDOB', '<=', cutoff.toISOString().split('T')[0]);
        }
        if (filterMaxAge) {
            const cutoff = new Date(today);
            cutoff.setFullYear(cutoff.getFullYear() - parseInt(filterMaxAge, 10));
            filteredQuery.andWhere('p.ParticipantDOB', '>=', cutoff.toISOString().split('T')[0]);
        }

        if (filterCity) {
            filteredQuery.andWhere('p.ParticipantCity', 'ilike', `%${filterCity}%`);
        }
        if (filterState) {
            filteredQuery.andWhere('p.ParticipantState', 'ilike', `%${filterState}%`);
        }
        if (filterRole) {
            filteredQuery.andWhere('p.ParticipantRole', filterRole);
        }
        if (filterInterest) {
            filteredQuery.andWhere('p.ParticipantFieldOfInterest', filterInterest);
        }

        const totalRow = await knex.count('* as count')
            .from(filteredQuery.clone().as('donations_filtered'))
            .first();
        const totalDonations = parseInt(totalRow?.count, 10) || 0;

        const totalPages = Math.max(Math.ceil(totalDonations / limit), 1);
        const safePage = Math.min(page, totalPages);
        const offset = (safePage - 1) * limit;

        const sortOptions = {
            DonationDate: 'pd.DonationDate',
            DonationAmount: 'pd.DonationAmount',
            DonationID: 'pd.DonationID'
        };
        const normalizedSortColumn = sortOptions[sortColumn] ? sortColumn : 'DonationDate';
        const safeSortColumn = sortOptions[normalizedSortColumn] || 'pd.DonationDate';
        const safeSortDir = sortDir === 'asc' ? 'asc' : 'desc';

        const donationRows = await filteredQuery.clone()
            .select(
                'pd.DonationID',
                'pd.DonationDate',
                'pd.DonationAmount',
                'pd.ParticipantID',
                'p.ParticipantEmail',
                'p.ParticipantFirstName',
                'p.ParticipantLastName',
                'p.ParticipantCity',
                'p.ParticipantState',
                'p.ParticipantFieldOfInterest',
                'p.ParticipantDOB'
            )
            .orderBy(safeSortColumn, safeSortDir)
            .orderBy('pd.DonationID', 'desc')
            .limit(limit)
            .offset(offset);

        const donations = donationRows.map((donation) => ({
            ...donation,
            DonationAmountValue: parseFloat(donation.DonationAmount) || 0,
            DonationAmountDisplay: donation.DonationAmount ? parseFloat(donation.DonationAmount).toFixed(2) : '0.00',
            DonationDateDisplay: formatDateForDisplay(donation.DonationDate),
            ParticipantAge: calculateAge(donation.ParticipantDOB)
        }));

        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        const startOfMonthStr = startOfMonth.toISOString().split('T')[0];
        const nextMonthStr = nextMonth.toISOString().split('T')[0];

        const totalAmountRow = await filteredQuery.clone()
            .sum('pd.DonationAmount as totalAmount')
            .first();

        const monthAmountRow = await filteredQuery.clone()
            .where('pd.DonationDate', '>=', startOfMonthStr)
            .andWhere('pd.DonationDate', '<', nextMonthStr)
            .sum('pd.DonationAmount as totalAmount')
            .first();

        let participantOptions = [];
        if (req.session.isAdmin) {
            participantOptions = await knex('Participants')
                .select('ParticipantID', 'ParticipantFirstName', 'ParticipantLastName', 'ParticipantEmail')
                .orderBy('ParticipantLastName', 'asc')
                .orderBy('ParticipantFirstName', 'asc');
        }

        res.render('donations', {
            pageTitle: 'Donations',
            donations,
            participantOptions,
            searchTerm,
            filters: {
                filterParticipantID,
                filterDonationID,
                filterStartDate,
                filterEndDate,
                filterMinAge,
                filterMaxAge,
                filterCity,
                filterState,
                filterRole,
                filterInterest,
                filterMinAmount,
                filterMaxAmount
            },
            sortColumn: normalizedSortColumn,
            sortDir: safeSortDir,
            currentPage: safePage,
            totalPages,
            totalDonations,
            hasNextPage: safePage < totalPages,
            pageSize: limit,
            metrics: {
                totalAmount: parseFloat(totalAmountRow?.totalAmount) || 0,
                monthAmount: parseFloat(monthAmountRow?.totalAmount) || 0,
                count: totalDonations
            },
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (err) {
        console.error('Error loading donations:', err);
        res.status(500).send('Error loading donations');
    }
});

app.post('/donations/add', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.status(418).render('landing', {
            layout: 'public',
            pageTitle: 'Welcome',
            error: 'You do not have admin access'
        });
    }

    try {
        const { ParticipantID, DonationAmount, DonationDate } = req.body;
        const parsedAmount = parseFloat(DonationAmount);

        // Only validate required fields + amount
        if (!ParticipantID || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
            return res.redirect(
                '/donations?error=' +
                encodeURIComponent('Participant and amount are required, and amount must be greater than zero.')
            );
        }

        const participant = await knex('Participants')
            .where('ParticipantID', ParticipantID)
            .first();

        if (!participant) {
            return res.redirect(
                '/donations?error=' +
                encodeURIComponent('Participant not found.')
            );
        }

        // Build insert object
        const insertData = {
            ParticipantID,
            DonationAmount: parsedAmount
        };

        // Only include DonationDate if the user actually entered one
        if (DonationDate && DonationDate.trim() !== '') {
            insertData.DonationDate = DonationDate; // assuming 'YYYY-MM-DD'
        }
        // else: leave it off so DB can use NULL or DEFAULT

        await knex('Participant_Donation').insert(insertData);

        return res.redirect(
            '/donations?success=' +
            encodeURIComponent('Donation recorded successfully.')
        );
    } catch (err) {
        console.error('Error adding donation:', err);
        return res.redirect(
            '/donations?error=' +
            encodeURIComponent('Error adding donation. Please try again.')
        );
    }
});


app.post('/donations/add/user', async (req, res) => {
    try {
        const { ParticipantID, DonationAmount, DonationDate } = req.body;
        const parsedAmount = parseFloat(DonationAmount);

        if (!ParticipantID || !DonationDate || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
            return res.redirect('/donations?error=' + encodeURIComponent('Please try again'));
        }

        const participant = await knex('Participants')
            .where('ParticipantID', ParticipantID)
            .first();

        if (!participant) {
            return res.redirect('/donations?error=' + encodeURIComponent('Participant not found.'));
        }

        await knex('Participant_Donation').insert({
            ParticipantID,
            DonationDate,
            DonationAmount: parsedAmount
        });

        return res.redirect('/donations?success=' + encodeURIComponent('Donation recorded successfully.'));
    } catch (err) {
        console.error('Error adding donation:', err);
        return res.redirect('/donations?error=' + encodeURIComponent('Error adding donation. Please try again.'));
    }
});

app.post('/donations/add/visitor', async (req, res) => {
    try {
        const { FirstName, LastName, Email, DonationAmount, DonationDate } = req.body;
        const parsedAmount = parseFloat(DonationAmount);

        if (!FirstName || !LastName || !Email || !DonationDate || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
            return res.redirect('/donations?error=' + encodeURIComponent('Please try again'));
        }

        const duplicate = await knex('Participants')
            .where('ParticipantEmail', Email)
            .first();

        if (!duplicate) {
            await knex('Participants').insert({
                ParticipantEmail: Email,
                ParticipantFirstName: FirstName,
                ParticipantLastName: LastName,
                ParticipantRole: 'd'
            });

            const newDonor = await knex('Participants')
                .where('ParticipantEmail', Email)
                .first();

            await knex('Participant_Donation').insert({
                ParticipantID: newDonor.ParticipantID,
                DonationDate,
                DonationAmount: parsedAmount
            });
        }

        await knex('Participant_Donation').insert({
            ParticipantID: duplicate.ParticipantID,
            DonationDate,
            DonationAmount: parsedAmount
        });

        return res.redirect('/donations?success=' + encodeURIComponent('Donation recorded successfully.'));
    } catch (err) {
        console.error('Error adding donation:', err);
        return res.redirect('/donations?error=' + encodeURIComponent('Error adding donation. Please try again.'));
    }
});

app.post('/donations/edit', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.status(418).render('landing', {
            layout: 'public',
            pageTitle: 'Welcome',
            error: 'You do not have admin access'
        });
    }

    try {
        const { DonationID, ParticipantID, DonationAmount, DonationDate } = req.body;
        const parsedAmount = parseFloat(DonationAmount);

        // Make date optional now
        if (!DonationID || !ParticipantID || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
            return res.redirect(
                '/donations?error=' +
                encodeURIComponent('Donation ID, participant, and a valid amount are required.')
            );
        }

        const donation = await knex('Participant_Donation')
            .where('DonationID', DonationID)
            .first();

        if (!donation) {
            return res.redirect('/donations?error=' + encodeURIComponent('Donation not found.'));
        }

        const participant = await knex('Participants')
            .where('ParticipantID', ParticipantID)
            .first();

        if (!participant) {
            return res.redirect('/donations?error=' + encodeURIComponent('Participant not found.'));
        }

        // Build update object
        const updateData = {
            ParticipantID,
            DonationAmount: parsedAmount
        };

        // Only update the date if provided (non-empty)
        if (DonationDate && DonationDate.trim() !== '') {
            updateData.DonationDate = DonationDate; // expecting 'YYYY-MM-DD'
        }
        // If blank, we leave DonationDate alone (keeps the existing value)

        await knex('Participant_Donation')
            .where('DonationID', DonationID)
            .update(updateData);

        return res.redirect(
            '/donations?success=' +
            encodeURIComponent('Donation updated successfully.')
        );
    } catch (err) {
        console.error('Error updating donation:', err);
        return res.redirect(
            '/donations?error=' +
            encodeURIComponent('Error updating donation. Please try again.')
        );
    }
});


app.post('/donations/delete', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.status(418).render('landing', {
            layout: 'public',
            pageTitle: 'Welcome',
            error: 'You do not have admin access'
        });
    }

    try {
        const { DonationID } = req.body;

        if (!DonationID) {
            return res.redirect('/donations?error=' + encodeURIComponent('Donation ID is required.'));
        }

        await knex('Participant_Donation')
            .where('DonationID', DonationID)
            .del();

        return res.redirect('/donations?success=' + encodeURIComponent('Donation deleted successfully.'));
    } catch (err) {
        console.error('Error deleting donation:', err);
        return res.redirect('/donations?error=' + encodeURIComponent('Error deleting donation. Please try again.'));
    }
});

app.get('/events', async (req, res) => {
    try {
        // Get all event templates for the grid
        const event_templates = await knex('Event_Templates')
            .select(
                'Event_Templates.EventID',
                'Event_Templates.EventName',
                'Event_Templates.EventType',
                'Event_Templates.EventDescription',
                'Event_Templates.EventRecurrencePattern',
                'Event_Templates.EventDefaultCapacity',
            )
            .orderBy('Event_Templates.EventID', 'asc');

        // Get upcoming occurrences (including current events) with template data and registration counts
        const now = new Date();
        const upcomingOccurrences = await knex('Event_Occurrence as eo')
            .join('Event_Templates as et', 'eo.EventID', 'et.EventID')
            .leftJoin('Registration as r', 'eo.OccurrenceID', 'r.OccurrenceID')
            .select(
                'eo.OccurrenceID',
                'eo.EventID',
                'eo.EventDateTimeStart',
                'eo.EventDateTimeEnd',
                'eo.EventLocation',
                'eo.EventCapacity',
                'eo.EventRegistrationDeadline',
                'et.EventName',
                'et.EventType',
                'et.EventDescription',
                'et.EventRecurrencePattern',
                'et.EventDefaultCapacity',
                knex.raw('COALESCE(COUNT(DISTINCT "r"."RegistrationID"), 0) as registration_count')
            )
            .where(function() {
                // Include events that haven't ended yet (or haven't started if no end time)
                this.where(function() {
                    this.whereNotNull('eo.EventDateTimeEnd')
                        .where('eo.EventDateTimeEnd', '>=', knex.fn.now());
                }).orWhere(function() {
                    this.whereNull('eo.EventDateTimeEnd')
                        .where('eo.EventDateTimeStart', '>=', knex.fn.now());
                });
            })
            .groupBy(
                'eo.OccurrenceID',
                'eo.EventID',
                'eo.EventDateTimeStart',
                'eo.EventDateTimeEnd',
                'eo.EventLocation',
                'eo.EventCapacity',
                'eo.EventRegistrationDeadline',
                'et.EventName',
                'et.EventType',
                'et.EventDescription',
                'et.EventRecurrencePattern',
                'et.EventDefaultCapacity'
            )
            .orderBy('eo.EventDateTimeStart', 'asc');

        // Calculate if each occurrence is full
        const upcomingEvents = upcomingOccurrences.map(occurrence => {
            const capacity = occurrence.EventCapacity || occurrence.EventDefaultCapacity;
            // Handle registration_count which might be a string, number, or bigint
            let registrationCount = 0;
            if (occurrence.registration_count !== null && occurrence.registration_count !== undefined) {
                registrationCount = typeof occurrence.registration_count === 'string' 
                    ? parseInt(occurrence.registration_count, 10) 
                    : Number(occurrence.registration_count);
                if (isNaN(registrationCount)) registrationCount = 0;
            }
            const isFull = capacity ? registrationCount >= capacity : false;
            
            return {
                ...occurrence,
                registrationCount,
                isFull,
                hasSpace: !isFull
            };
        });

        res.render('events', {
            pageTitle: 'Events',
            event_templates,
            upcomingEvents,
        });
    } catch (err) {
        console.error('Error loading events:', err);
        console.error('Error stack:', err.stack);
        res.status(500).send(`Error loading events: ${err.message}`);
    }
});

app.get('/registration/:id', async (req, res) => {
    try {
        const eventId = parseInt(req.params.id, 10);
        const focusedOccurrenceId = req.query.occurrence ? parseInt(req.query.occurrence, 10) : null;
        
        if (isNaN(eventId)) {
            return res.status(400).send('Invalid event ID');
        }

        // Get event template details
        const eventTemplate = await knex('Event_Templates')
            .where('EventID', eventId)
            .first();

        if (!eventTemplate) {
            return res.status(404).send('Event not found');
        }

        // Get event occurrences - all for admins, future only for regular users
        const now = new Date();
        let occurrences;
        
        if (req.session.isAdmin) {
            // For admins: get all occurrences, then sort - future first (ascending), past last (descending)
            const allOccurrences = await knex('Event_Occurrence')
                .join('Event_Templates', 'Event_Occurrence.EventID', 'Event_Templates.EventID')
                .select(
                    'Event_Occurrence.OccurrenceID',
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
                .where('Event_Occurrence.EventID', eventId)
                .orderBy('Event_Occurrence.EventDateTimeStart', 'asc');
            
            // Separate upcoming and past, then reorder
            // Upcoming: events that haven't ended yet (or haven't started if no end time)
            const upcomingOccurrences = allOccurrences.filter(o => {
                const start = new Date(o.EventDateTimeStart);
                const end = o.EventDateTimeEnd ? new Date(o.EventDateTimeEnd) : null;
                return end ? end >= now : start >= now;
            });
            const pastOccurrences = allOccurrences.filter(o => {
                const start = new Date(o.EventDateTimeStart);
                const end = o.EventDateTimeEnd ? new Date(o.EventDateTimeEnd) : null;
                return end ? end < now : start < now;
            }).reverse();
            
            occurrences = [...upcomingOccurrences, ...pastOccurrences];
        } else {
            // For regular users: only future events, ascending
            occurrences = await knex('Event_Occurrence')
                .join('Event_Templates', 'Event_Occurrence.EventID', 'Event_Templates.EventID')
                .select(
                    'Event_Occurrence.OccurrenceID',
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
                .where('Event_Occurrence.EventID', eventId)
                .where('Event_Occurrence.EventDateTimeStart', '>=', now)
                .orderBy('Event_Occurrence.EventDateTimeStart', 'asc');
        }

        // Get registration counts and attendance for each occurrence
        const occurrenceIds = occurrences.map(o => o.OccurrenceID);
        let registrationCounts = {};
        let attendanceCounts = {};

        if (occurrenceIds.length > 0) {
            // Get registration counts
            const regCounts = await knex('Registration as r')
                .select('r.OccurrenceID')
                .count('r.RegistrationID as count')
                .whereIn('r.OccurrenceID', occurrenceIds)
                .groupBy('r.OccurrenceID');

            regCounts.forEach(row => {
                registrationCounts[row.OccurrenceID] = parseInt(row.count, 10) || 0;
            });

            // Get attendance counts (for past events, admins only)
            if (req.session.isAdmin) {
                const attCounts = await knex('Registration as r')
                    .select('r.OccurrenceID')
                    .count('r.RegistrationID as count')
                    .whereIn('r.OccurrenceID', occurrenceIds)
                    .where('r.RegistrationAttendedFlag', true)
                    .groupBy('r.OccurrenceID');

                attCounts.forEach(row => {
                    attendanceCounts[row.OccurrenceID] = parseInt(row.count, 10) || 0;
                });
            }
        }

        // Initialize counts for occurrences with no registrations
        occurrenceIds.forEach(id => {
            if (!registrationCounts[id]) registrationCounts[id] = 0;
            if (!attendanceCounts[id]) attendanceCounts[id] = 0;
        });

        // Build unique location options for admin dropdown
        const locationOptions = Array.from(new Set(
            occurrences
                .map(o => o.EventLocation)
                .filter(loc => typeof loc === 'string' && loc.trim().length > 0)
                .map(loc => loc.trim())
        ));

        // Add registration/attendance data to occurrences
        const occurrencesWithData = occurrences.map(occurrence => {
            const regCount = registrationCounts[occurrence.OccurrenceID] || 0;
            const capacity = occurrence.EventCapacity || occurrence.EventDefaultCapacity;
            const isFull = capacity ? regCount >= capacity : false;
            // Event is past only if end time has passed (or if no end time, if start has passed)
            const start = new Date(occurrence.EventDateTimeStart);
            const end = occurrence.EventDateTimeEnd ? new Date(occurrence.EventDateTimeEnd) : null;
            const isPast = end ? end < now : start < now;
            const attCount = attendanceCounts[occurrence.OccurrenceID] || 0;

            return {
                ...occurrence,
                registrationCount: regCount,
                attendanceCount: attCount,
                isFull,
                hasSpace: !isFull,
                isPast
            };
        });

        // Check which occurrences the user is already registered for
        let registeredOccurrenceIds = [];
        if (req.session.user && req.session.user.ParticipantID && occurrencesWithData.length > 0) {
            const registrations = await knex('Registration')
                .where('ParticipantID', req.session.user.ParticipantID)
                .whereIn('OccurrenceID', occurrencesWithData.map(o => o.OccurrenceID))
                .select('OccurrenceID');
            registeredOccurrenceIds = registrations.map(r => r.OccurrenceID);
        }

        // Build admin-only data for modal (participants per occurrence)
        let adminOccurrenceData = {};
        if (req.session.isAdmin) {
            adminOccurrenceData = occurrencesWithData.reduce((acc, occurrence) => {
                acc[occurrence.OccurrenceID] = {
                    occurrence: {
                        id: occurrence.OccurrenceID,
                        title: occurrence.EventName,
                        start: occurrence.EventDateTimeStart,
                        end: occurrence.EventDateTimeEnd,
                        location: occurrence.EventLocation,
                        capacity: occurrence.EventCapacity || occurrence.EventDefaultCapacity || null,
                        registrationCount: occurrence.registrationCount,
                        isPast: occurrence.isPast
                    },
                    participants: []
                };
                return acc;
            }, {});

            if (occurrenceIds.length > 0) {
                const adminRegistrations = await knex('Registration as r')
                    .leftJoin('Participants as p', 'r.ParticipantID', 'p.ParticipantID')
                    .leftJoin('Surveys as s', 'r.RegistrationID', 's.RegistrationID')
                    .select(
                        'r.OccurrenceID',
                        'r.ParticipantID',
                        'r.RegistrationID',
                        'r.RegistrationStatus',
                        'r.RegistrationAttendedFlag',
                        'r.RegistrationCheckInTime',
                        'r.RegistrationCreatedAt',
                        'p.ParticipantFirstName',
                        'p.ParticipantLastName',
                        'p.ParticipantEmail',
                        's.SurveyID'
                    )
                    .whereIn('r.OccurrenceID', occurrenceIds)
                    .orderBy('r.RegistrationCreatedAt', 'asc');

                adminRegistrations.forEach((row) => {
                    const bucket = adminOccurrenceData[row.OccurrenceID];
                    if (!bucket) return;
                    const nameParts = [row.ParticipantFirstName, row.ParticipantLastName].filter(Boolean);
                    const fullName = nameParts.length ? nameParts.join(' ') : `Participant ${row.ParticipantID}`;

                    bucket.participants.push({
                        participantId: row.ParticipantID,
                        registrationId: row.RegistrationID,
                        name: fullName,
                        email: row.ParticipantEmail || 'No email',
                        status: row.RegistrationStatus || 'Registered',
                        attended: !!row.RegistrationAttendedFlag,
                        checkInTime: row.RegistrationCheckInTime,
                        surveyId: row.SurveyID || null
                    });
                });
            }
        }

        res.render('registration', {
            pageTitle: `Register for ${eventTemplate.EventName}`,
            eventTemplate,
            occurrences: occurrencesWithData,
            focusedOccurrenceId,
            registeredOccurrenceIds,
            adminOccurrenceData,
            locationOptions
        });
    } catch (err) {
        console.error('Error loading registration page:', err);
        res.status(500).send('Error loading registration page');
    }
});

// POST /register-occurrence: Register user for an occurrence
app.post('/register-occurrence', async (req, res) => {
    try {
        if (!req.session.user || !req.session.user.ParticipantID) {
            return res.status(401).json({ success: false, error: 'Please log in to register' });
        }

        const { occurrenceId } = req.body;
        const participantId = req.session.user.ParticipantID;

        if (!occurrenceId) {
            return res.status(400).json({ success: false, error: 'Occurrence ID is required' });
        }

        // Check if occurrence exists and is in the future
        const occurrence = await knex('Event_Occurrence')
            .where('OccurrenceID', occurrenceId)
            .where('EventDateTimeStart', '>=', knex.fn.now())
            .first();

        if (!occurrence) {
            return res.status(404).json({ success: false, error: 'Occurrence not found or has already passed' });
        }

        // Check if already registered
        const existingRegistration = await knex('Registration')
            .where('ParticipantID', participantId)
            .where('OccurrenceID', occurrenceId)
            .first();

        if (existingRegistration) {
            return res.status(400).json({ success: false, error: 'Already registered for this occurrence' });
        }

        // Register
        await knex('Registration').insert({
            ParticipantID: participantId,
            OccurrenceID: occurrenceId,
            RegistrationStatus: 'Registered',
            RegistrationCreatedAt: knex.fn.now()
        });

        return res.json({ success: true, message: 'Successfully registered!' });
    } catch (err) {
        console.error('Error registering for occurrence:', err);
        return res.status(500).json({ success: false, error: 'Error registering for occurrence' });
    }
});

// POST /unregister-occurrence: Unregister user from an occurrence
app.post('/unregister-occurrence', async (req, res) => {
    try {
        if (!req.session.user || !req.session.user.ParticipantID) {
            return res.status(401).json({ success: false, error: 'Please log in to unregister' });
        }

        const { occurrenceId } = req.body;
        const participantId = req.session.user.ParticipantID;

        if (!occurrenceId) {
            return res.status(400).json({ success: false, error: 'Occurrence ID is required' });
        }

        // Check if registered
        const existingRegistration = await knex('Registration')
            .where('ParticipantID', participantId)
            .where('OccurrenceID', occurrenceId)
            .first();

        if (!existingRegistration) {
            return res.status(404).json({ success: false, error: 'Not registered for this occurrence' });
        }

        // Unregister
        await knex('Registration')
            .where('ParticipantID', participantId)
            .where('OccurrenceID', occurrenceId)
            .delete();

        return res.json({ success: true, message: 'Successfully unregistered!' });
    } catch (err) {
        console.error('Error unregistering from occurrence:', err);
        return res.status(500).json({ success: false, error: 'Error unregistering from occurrence' });
    }
});

// POST /registrations/:id/cancel - user cancel before event start
app.post('/registrations/:id/cancel', async (req, res) => {
    try {
        if (!req.session.user || !req.session.user.ParticipantID) {
            return res.status(401).json({ success: false, error: 'Please log in' });
        }
        const registrationId = parseInt(req.params.id, 10);
        if (!registrationId) {
            return res.status(400).json({ success: false, error: 'Registration ID is required' });
        }
        const registration = await knex('Registration')
            .where('RegistrationID', registrationId)
            .andWhere('ParticipantID', req.session.user.ParticipantID)
            .first();
        if (!registration) {
            return res.status(404).json({ success: false, error: 'Registration not found' });
        }
        await knex('Registration')
            .where('RegistrationID', registrationId)
            .update({ RegistrationStatus: 'Cancelled', RegistrationAttendedFlag: false, RegistrationCheckInTime: null });
        return res.json({ success: true, message: 'Registration cancelled' });
    } catch (err) {
        console.error('Error cancelling registration:', err);
        return res.status(500).json({ success: false, error: 'Error cancelling registration' });
    }
});

// POST /registrations/:id/check-in - user self check-in during event
app.post('/registrations/:id/check-in', async (req, res) => {
    try {
        if (!req.session.user || !req.session.user.ParticipantID) {
            return res.status(401).json({ success: false, error: 'Please log in' });
        }
        const registrationId = parseInt(req.params.id, 10);
        if (!registrationId) {
            return res.status(400).json({ success: false, error: 'Registration ID is required' });
        }
        const registration = await knex('Registration')
            .where('RegistrationID', registrationId)
            .andWhere('ParticipantID', req.session.user.ParticipantID)
            .first();
        if (!registration) {
            return res.status(404).json({ success: false, error: 'Registration not found' });
        }
        await knex('Registration')
            .where('RegistrationID', registrationId)
            .update({
                RegistrationStatus: 'Registered',
                RegistrationAttendedFlag: true,
                RegistrationCheckInTime: knex.fn.now()
            });
        return res.json({ success: true, message: 'Checked in' });
    } catch (err) {
        console.error('Error checking in:', err);
        return res.status(500).json({ success: false, error: 'Error checking in' });
    }
});

// POST /occurrences/:id/delete: Admin delete an occurrence (and its registrations)
app.post('/occurrences/:id/delete', async (req, res) => {
    try {
        if (!req.session.isAdmin) {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }

        const occurrenceId = parseInt(req.params.id, 10);
        if (!occurrenceId) {
            return res.status(400).json({ success: false, error: 'Occurrence ID is required' });
        }

        await knex.transaction(async (trx) => {
            await trx('Registration').where('OccurrenceID', occurrenceId).del();
            const deleted = await trx('Event_Occurrence').where('OccurrenceID', occurrenceId).del();
            if (!deleted) {
                throw new Error('Occurrence not found');
            }
        });

        return res.json({ success: true, message: 'Occurrence deleted' });
    } catch (err) {
        console.error('Error deleting occurrence:', err);
        const message = err.message === 'Occurrence not found' ? err.message : 'Error deleting occurrence';
        return res.status(500).json({ success: false, error: message });
    }
});

// POST /occurrences/:id/update: Admin update occurrence date/time/location
app.post('/occurrences/:id/update', async (req, res) => {
    try {
        if (!req.session.isAdmin) {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }

        const occurrenceId = parseInt(req.params.id, 10);
        if (!occurrenceId) {
            return res.status(400).json({ success: false, error: 'Occurrence ID is required' });
        }

        const { date, startTime, endTime, location } = req.body || {};
        if (!date || !startTime) {
            return res.status(400).json({ success: false, error: 'Date and start time are required' });
        }

        const start = new Date(`${date}T${startTime}`);
        const end = endTime ? new Date(`${date}T${endTime}`) : null;

        if (Number.isNaN(start.getTime()) || (endTime && Number.isNaN(end.getTime()))) {
            return res.status(400).json({ success: false, error: 'Invalid date or time' });
        }

        await knex('Event_Occurrence')
            .where('OccurrenceID', occurrenceId)
            .update({
                EventDateTimeStart: start.toISOString(),
                EventDateTimeEnd: end ? end.toISOString() : null,
                EventLocation: location || null
            });

        return res.json({
            success: true,
            message: 'Occurrence updated',
            occurrence: {
                EventDateTimeStart: start.toISOString(),
                EventDateTimeEnd: end ? end.toISOString() : null,
                EventLocation: location || null
            }
        });
    } catch (err) {
        console.error('Error updating occurrence:', err);
        return res.status(500).json({ success: false, error: 'Error updating occurrence' });
    }
});

// POST /admin/occurrences/create: Admin create a new occurrence
app.post('/admin/occurrences/create', async (req, res) => {
    try {
        if (!req.session.isAdmin) {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }

        const { eventId, date, startTime, endTime, location, capacity } = req.body || {};
        
        if (!eventId || !date || !startTime || !capacity || capacity < 1) {
            return res.status(400).json({ success: false, error: 'Event ID, date, start time, and capacity are required' });
        }

        // Validate event template exists
        const eventTemplate = await knex('Event_Templates')
            .where('EventID', parseInt(eventId, 10))
            .first();

        if (!eventTemplate) {
            return res.status(404).json({ success: false, error: 'Event template not found' });
        }

        const start = new Date(`${date}T${startTime}`);
        const end = endTime ? new Date(`${date}T${endTime}`) : null;

        if (Number.isNaN(start.getTime()) || (endTime && Number.isNaN(end.getTime()))) {
            return res.status(400).json({ success: false, error: 'Invalid date or time' });
        }

        // Check if end is before start
        if (end && end <= start) {
            return res.status(400).json({ success: false, error: 'End time must be after start time' });
        }

        // Create the occurrence
        const [occurrenceId] = await knex('Event_Occurrence')
            .insert({
                EventID: parseInt(eventId, 10),
                EventDateTimeStart: start.toISOString(),
                EventDateTimeEnd: end ? end.toISOString() : null,
                EventLocation: location || null,
                EventCapacity: parseInt(capacity, 10)
            })
            .returning('OccurrenceID');

        return res.json({
            success: true,
            message: 'Event occurrence created successfully',
            occurrenceId: occurrenceId.OccurrenceID || occurrenceId
        });
    } catch (err) {
        console.error('Error creating occurrence:', err);
        return res.status(500).json({ success: false, error: 'Error creating occurrence' });
    }
});

// Admin: register a participant to an occurrence
app.post('/admin/occurrences/:id/register-user', async (req, res) => {
    try {
        if (!req.session.isAdmin) {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }
        const occurrenceId = parseInt(req.params.id, 10);
        const participantId = parseInt(req.body.participantId, 10);
        if (!occurrenceId || !participantId) {
            return res.status(400).json({ success: false, error: 'Occurrence ID and participant ID are required' });
        }

        // Check participant exists
        const participant = await knex('Participants').where('ParticipantID', participantId).first();
        if (!participant) {
            return res.status(404).json({ success: false, error: 'Participant not found' });
        }

        // Check duplicate
        const existing = await knex('Registration')
            .where('ParticipantID', participantId)
            .andWhere('OccurrenceID', occurrenceId)
            .first();
        if (existing) {
            return res.status(400).json({ success: false, error: 'Participant already registered' });
        }

        const [registrationId] = await knex('Registration')
            .insert({
                ParticipantID: participantId,
                OccurrenceID: occurrenceId,
                RegistrationStatus: 'Registered',
                RegistrationCreatedAt: knex.fn.now()
            })
            .returning('RegistrationID');

        return res.json({
            success: true,
            registration: {
                registrationId: registrationId?.RegistrationID || registrationId,
                participantId,
                name: `${participant.ParticipantFirstName || ''} ${participant.ParticipantLastName || ''}`.trim() || `Participant ${participantId}`,
                email: participant.ParticipantEmail || 'No email',
                status: 'Registered',
                attended: false,
                checkInTime: null,
                surveyId: null
            }
        });
    } catch (err) {
        console.error('Error registering participant (admin):', err);
        return res.status(500).json({ success: false, error: 'Error registering participant' });
    }
});

// Admin: update registration status/attendance
app.post('/admin/registrations/:id/update-status', async (req, res) => {
    try {
        if (!req.session.isAdmin) {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }
        const registrationId = parseInt(req.params.id, 10);
        if (!registrationId) {
            return res.status(400).json({ success: false, error: 'Registration ID is required' });
        }
        const { status, attended } = req.body || {};
        const attendedFlag = attended === true || attended === 'true';
        const newStatus = status || 'Registered';

        await knex('Registration')
            .where('RegistrationID', registrationId)
            .update({
                RegistrationStatus: newStatus,
                RegistrationAttendedFlag: attendedFlag,
                RegistrationCheckInTime: attendedFlag ? knex.fn.now() : null
            });

        return res.json({ success: true });
    } catch (err) {
        console.error('Error updating registration status (admin):', err);
        return res.status(500).json({ success: false, error: 'Error updating registration status' });
    }
});

// Admin: remove a registration
app.post('/admin/registrations/:id/delete', async (req, res) => {
    try {
        if (!req.session.isAdmin) {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }
        const registrationId = parseInt(req.params.id, 10);
        if (!registrationId) {
            return res.status(400).json({ success: false, error: 'Registration ID is required' });
        }
        await knex('Surveys').where('RegistrationID', registrationId).del();
        await knex('Registration').where('RegistrationID', registrationId).del();
        return res.json({ success: true });
    } catch (err) {
        console.error('Error deleting registration (admin):', err);
        return res.status(500).json({ success: false, error: 'Error deleting registration' });
    }
});

// Admin: participant search (simple typeahead)
app.get('/admin/participants/search', async (req, res) => {
    try {
        if (!req.session.isAdmin) {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }
        const q = (req.query.q || '').trim();
        if (!q) {
            return res.json({ success: true, results: [] });
        }
        const searchPattern = `%${q}%`;
        const results = await knex('Participants')
            .select('ParticipantID', 'ParticipantFirstName', 'ParticipantLastName', 'ParticipantEmail')
            .where(function () {
                this.where('ParticipantFirstName', 'ilike', searchPattern)
                    .orWhere('ParticipantLastName', 'ilike', searchPattern)
                    .orWhereRaw("(\"ParticipantFirstName\" || ' ' || \"ParticipantLastName\") ILIKE ?", [searchPattern])
                    .orWhere('ParticipantEmail', 'ilike', searchPattern)
                    .orWhereRaw('CAST("ParticipantID" AS TEXT) ILIKE ?', [searchPattern]);
            })
            .orderBy('ParticipantFirstName', 'asc')
            .limit(10);
        return res.json({
            success: true,
            results: results.map(r => ({
                participantId: r.ParticipantID,
                name: `${r.ParticipantFirstName || ''} ${r.ParticipantLastName || ''}`.trim() || `Participant ${r.ParticipantID}`,
                email: r.ParticipantEmail || 'No email'
            }))
        });
    } catch (err) {
        console.error('Error searching participants (admin):', err);
        return res.status(500).json({ success: false, error: 'Error searching participants' });
    }
});

app.get('/milestones', async (req, res) => {
    try {
        const searchTerm = (req.query.search || '').trim();
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = 50;
        const filterParticipantID = req.query.filterParticipantID || '';
        const filterMilestoneID = req.query.filterMilestoneID || '';
        const filterStartDate = req.query.filterStartDate || '';
        const filterEndDate = req.query.filterEndDate || '';
        const filterMinAge = req.query.filterMinAge || '';
        const filterMaxAge = req.query.filterMaxAge || '';
        const filterTitle = req.query.filterTitle || '';
        const filterCategory = req.query.filterCategory || '';
        const filterCity = req.query.filterCity || '';
        const filterState = req.query.filterState || '';
        const filterRole = req.query.filterRole || '';
        const filterInterest = req.query.filterInterest || '';
        const sortColumn = req.query.sort || 'MilestoneDate';
        const sortDir = (req.query.sortDir || 'desc').toLowerCase();

        const baseQuery = knex('Participant_Milestone as pm')
            .join('Participants as p', 'pm.ParticipantID', 'p.ParticipantID');

        if (!req.session.isAdmin) {
            baseQuery.where('p.ParticipantID', req.session.user.ParticipantID);
        }

        const filteredQuery = baseQuery.clone();

        if (searchTerm) {
            const searchPattern = `%${searchTerm}%`;
            filteredQuery.andWhere(function () {
                this.where('pm.MilestoneTitle', 'ilike', searchPattern)
                    .orWhere('pm.MilestoneCategory', 'ilike', searchPattern)
                    .orWhere('p.ParticipantFirstName', 'ilike', searchPattern)
                    .orWhere('p.ParticipantLastName', 'ilike', searchPattern)
                    .orWhere('p.ParticipantEmail', 'ilike', searchPattern)
                    .orWhereRaw(
                        '("p"."ParticipantFirstName" || \' \' || "p"."ParticipantLastName") ILIKE ?',
                        [searchPattern]
                    )
                    .orWhereRaw('CAST(pm."MilestoneID" AS TEXT) ILIKE ?', [searchPattern])
                    .orWhereRaw('CAST(pm."MilestoneDate" AS TEXT) ILIKE ?', [searchPattern]);
            });
        }
        if (filterParticipantID) {
            filteredQuery.andWhere('pm.ParticipantID', filterParticipantID);
        }
        if (filterMilestoneID) {
            filteredQuery.andWhere('pm.MilestoneID', filterMilestoneID);
        }
        if (filterStartDate) {
            filteredQuery.andWhere('pm.MilestoneDate', '>=', filterStartDate);
        }
        if (filterEndDate) {
            filteredQuery.andWhere('pm.MilestoneDate', '<=', filterEndDate);
        }
        if (filterTitle) {
            filteredQuery.andWhere('pm.MilestoneTitle', 'ilike', `%${filterTitle}%`);
        }
    
        if (filterCategory) {
            filteredQuery.andWhere('pm.MilestoneCategory', 'ilike', `%${filterCategory}%`);
        }

        const today = new Date();
        if (filterMinAge || filterMaxAge) {
            filteredQuery.whereNotNull('p.ParticipantDOB');
        }
        if (filterMinAge) {
            const cutoff = new Date(today);
            cutoff.setFullYear(cutoff.getFullYear() - parseInt(filterMinAge, 10));
            filteredQuery.andWhere('p.ParticipantDOB', '<=', cutoff.toISOString().split('T')[0]);
        }
        if (filterMaxAge) {
            const cutoff = new Date(today);
            cutoff.setFullYear(cutoff.getFullYear() - parseInt(filterMaxAge, 10));
            filteredQuery.andWhere('p.ParticipantDOB', '>=', cutoff.toISOString().split('T')[0]);
        }

        if (filterCity) {
            filteredQuery.andWhere('p.ParticipantCity', 'ilike', `%${filterCity}%`);
        }
        if (filterState) {
            filteredQuery.andWhere('p.ParticipantState', 'ilike', `%${filterState}%`);
        }
        if (filterRole) {
            filteredQuery.andWhere('p.ParticipantRole', filterRole);
        }
        if (filterInterest) {
            filteredQuery.andWhere('p.ParticipantFieldOfInterest', filterInterest);
        }

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

        const totalFilteredRow = await knex.count('* as count')
            .from(filteredQuery.clone().as('milestone_filtered'))
            .first();
        const totalFilteredMilestones = parseInt(totalFilteredRow?.count, 10) || 0;

        const totalAchievedRow = await knex.count('* as count')
            .from(
                filteredQuery.clone()
                    .whereNotNull('pm.MilestoneDate')
                    .andWhere('pm.MilestoneDate', '<=', now)
                    .as('milestone_achieved')
            )
            .first();
        const totalAchievedMilestones = parseInt(totalAchievedRow?.count, 10) || 0;

        const monthCountRow = await filteredQuery.clone()
            .where('pm.MilestoneDate', '>=', startOfMonth)
            .andWhere('pm.MilestoneDate', '<', nextMonth)
            .whereNotNull('pm.MilestoneDate')
            .andWhere('pm.MilestoneDate', '<=', now)
            .count('* as count')
            .first();

        const futureCountRow = await filteredQuery.clone()
            .where('pm.MilestoneDate', '>', now)
            .count('* as count')
            .first();

        const milestonesThisMonth = parseInt(monthCountRow?.count, 10) || 0;
        const futureMilestones = parseInt(futureCountRow?.count, 10) || 0;
        const totalPages = Math.max(Math.ceil(totalFilteredMilestones / limit), 1);
        const safePage = Math.min(page, totalPages);
        const offset = (safePage - 1) * limit;

        const sortOptions = {
            MilestoneDate: 'pm.MilestoneDate',
            MilestoneTitle: 'pm.MilestoneTitle',
            MilestoneCategory: 'pm.MilestoneCategory'
        };
        const normalizedSortColumn = sortOptions[sortColumn] ? sortColumn : 'MilestoneDate';
        const safeSortColumn = sortOptions[normalizedSortColumn] || 'pm.MilestoneDate';
        const safeSortDir = sortDir === 'asc' ? 'asc' : 'desc';

        const milestoneRows = await filteredQuery.clone()
            .select(
                'pm.MilestoneID',
                'pm.MilestoneTitle',
                'pm.MilestoneCategory',
                'pm.MilestoneDate',
                'pm.ParticipantID',
                'p.ParticipantEmail',
                'p.ParticipantFirstName',
                'p.ParticipantLastName',
                'p.ParticipantCity',
                'p.ParticipantState',
                'p.ParticipantFieldOfInterest',
                'p.ParticipantDOB'
            )
            .orderBy(safeSortColumn, safeSortDir)
            .orderBy('pm.MilestoneID', 'desc')
            .limit(limit)
            .offset(offset);

        const milestones = milestoneRows.map(m => ({
            ...m,
            MilestoneDateDisplay: formatDateForDisplay(m.MilestoneDate),
            ParticipantAge: calculateAge(m.ParticipantDOB)
        }));

        let participantOptions = [];
        let milestoneCategories = [];
        if (req.session.isAdmin) {
            participantOptions = await knex('Participants')
                .select('ParticipantID', 'ParticipantFirstName', 'ParticipantLastName', 'ParticipantEmail')
                .orderBy('ParticipantLastName', 'asc')
                .orderBy('ParticipantFirstName', 'asc');

            milestoneCategories = await knex('Participant_Milestone')
                .distinct('MilestoneCategory')
                .whereNotNull('MilestoneCategory')
                .orderBy('MilestoneCategory', 'asc')
                .pluck('MilestoneCategory');
        }

        res.render('milestones', {
            pageTitle: 'Milestones',
            milestones,
            participantOptions,
            milestoneCategories,
            searchTerm,
            filters: {
                filterParticipantID,
                filterMilestoneID,
                filterStartDate,
                filterEndDate,
                filterTitle,
                filterCategory,
                filterMinAge,
                filterMaxAge,
                filterCity,
                filterState,
                filterRole,
                filterInterest
            },
            sortColumn: normalizedSortColumn,
            sortDir: safeSortDir,
            currentPage: safePage,
            totalPages,
            totalMilestones: totalFilteredMilestones,
            hasNextPage: safePage < totalPages,
            pageSize: limit,
            metrics: {
                total: totalAchievedMilestones,
                month: milestonesThisMonth,
                future: futureMilestones
            },
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (err) {
        console.error('Error loading milestones:', err);
        res.status(500).send('Error loading milestones');
    }
});

app.post('/milestones/add', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.status(418).render('landing', {
            layout: 'public',
            pageTitle: 'Welcome',
            error: 'You do not have admin access'
        });
    }

    try {
        const { ParticipantID, MilestoneTitle, MilestoneCategory, MilestoneDate } = req.body;

        if (!ParticipantID || !MilestoneTitle || !MilestoneCategory || !MilestoneDate ) {
            return res.redirect('/milestones?error=' + encodeURIComponent('All milestone fields are required.'));
        }

        const participant = await knex('Participants')
            .where('ParticipantID', ParticipantID)
            .first();

        if (!participant) {
            return res.redirect('/milestones?error=' + encodeURIComponent('Participant not found.'));
        }

        await knex('Participant_Milestone').insert({
            ParticipantID,
            MilestoneTitle,
            MilestoneCategory,
            MilestoneDate
        });

        return res.redirect('/milestones?success=' + encodeURIComponent('Milestone added successfully.'));
    } catch (err) {
        console.error('Error adding milestone:', err);
        return res.redirect('/milestones?error=' + encodeURIComponent('Error adding milestone. Please try again.'));
    }
});

app.post('/milestones/edit', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.status(418).render('landing', {
            layout: 'public',
            pageTitle: 'Welcome',
            error: 'You do not have admin access'
        });
    }

    try {
        const { MilestoneID, ParticipantID, MilestoneTitle, MilestoneCategory, MilestoneDate } = req.body;

        if (!MilestoneID || !ParticipantID || !MilestoneTitle || !MilestoneCategory || !MilestoneDate) {
            return res.redirect('/milestones?error=' + encodeURIComponent('All milestone fields are required.'));
        }

        const milestone = await knex('Participant_Milestone')
            .where('MilestoneID', MilestoneID)
            .first();

        if (!milestone) {
            return res.redirect('/milestones?error=' + encodeURIComponent('Milestone not found.'));
        }

        const participant = await knex('Participants')
            .where('ParticipantID', ParticipantID)
            .first();

        if (!participant) {
            return res.redirect('/milestones?error=' + encodeURIComponent('Participant not found.'));
        }

        await knex('Participant_Milestone')
            .where('MilestoneID', MilestoneID)
            .update({
                ParticipantID,
                MilestoneTitle,
                MilestoneCategory,
                MilestoneDate
            });

        return res.redirect('/milestones?success=' + encodeURIComponent('Milestone updated successfully.'));
    } catch (err) {
        console.error('Error updating milestone:', err);
        return res.redirect('/milestones?error=' + encodeURIComponent('Error updating milestone. Please try again.'));
    }
});

app.post('/milestones/delete', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.status(418).render('landing', {
            layout: 'public',
            pageTitle: 'Welcome',
            error: 'You do not have admin access'
        });
    }

    try {
        const { MilestoneID } = req.body;

        if (!MilestoneID) {
            return res.redirect('/milestones?error=' + encodeURIComponent('Milestone ID is required.'));
        }

        await knex('Participant_Milestone')
            .where('MilestoneID', MilestoneID)
            .del();

        return res.redirect('/milestones?success=' + encodeURIComponent('Milestone deleted successfully.'));
    } catch (err) {
        console.error('Error deleting milestone:', err);
        return res.redirect('/milestones?error=' + encodeURIComponent('Error deleting milestone. Please try again.'));
    }
});

app.get('/surveys', async (req, res) => {
    try {
        const searchTerm = (req.query.search || '').trim();
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = 50;
        const filterStartDate = req.query.filterStartDate || '';
        const filterEndDate = req.query.filterEndDate || '';
        const filterEventStartDate = req.query.filterEventStartDate || '';
        const filterEventEndDate = req.query.filterEventEndDate || '';
        const filterEventTitle = req.query.filterEventTitle || '';
        const filterMinAge = req.query.filterMinAge || '';
        const filterMaxAge = req.query.filterMaxAge || '';
        const filterCity = req.query.filterCity || '';
        const filterState = req.query.filterState || '';
        const filterRole = req.query.filterRole || '';
        const filterInterest = req.query.filterInterest || '';
        const filterSurveyID = req.query.filterSurveyID ? parseInt(req.query.filterSurveyID, 10) : null;

        const baseQuery = knex('Surveys as s')
            .join('Registration as r', 's.RegistrationID', 'r.RegistrationID')
            .join('Participants as p', 'r.ParticipantID', 'p.ParticipantID')
            .join('Event_Occurrence as eo', 'r.OccurrenceID', 'eo.OccurrenceID')
            .join('Event_Templates as et', 'eo.EventID', 'et.EventID');

        if (!req.session.isAdmin) {
            baseQuery.where('p.ParticipantID', req.session.user.ParticipantID);
        }

        const filteredQuery = baseQuery.clone();

        if (searchTerm) {
            const searchPattern = `%${searchTerm}%`;
            filteredQuery.andWhere(function () {
                this.where('p.ParticipantFirstName', 'ilike', searchPattern)
                    .orWhere('p.ParticipantLastName', 'ilike', searchPattern)
                    .orWhere('p.ParticipantEmail', 'ilike', searchPattern)
                    .orWhere('et.EventName', 'ilike', searchPattern)
                    .orWhereRaw("(\"p\".\"ParticipantFirstName\" || ' ' || \"p\".\"ParticipantLastName\") ILIKE ?", [searchPattern])
                    .orWhereRaw('CAST(s."SurveyID" AS TEXT) ILIKE ?', [searchPattern])
                    .orWhereRaw('CAST(s."SurveyOverallScore" AS TEXT) ILIKE ?', [searchPattern])
                    .orWhere('s.SurveyComments', 'ilike', searchPattern);
            });
        }

        if (filterStartDate) {
            filteredQuery.andWhere('s.SurveySubmissionDate', '>=', filterStartDate);
        }
        if (filterEndDate) {
            filteredQuery.andWhere('s.SurveySubmissionDate', '<=', filterEndDate);
        }
        if (filterEventStartDate) {
            filteredQuery.andWhere('eo.EventDateTimeStart', '>=', filterEventStartDate);
        }
        if (filterEventEndDate) {
            filteredQuery.andWhere('eo.EventDateTimeStart', '<=', filterEventEndDate);
        }
        if (filterEventTitle) {
            filteredQuery.andWhere('et.EventName', filterEventTitle);
        }

        const today = new Date();
        if (filterMinAge || filterMaxAge) {
            filteredQuery.whereNotNull('p.ParticipantDOB');
        }
        if (filterMinAge) {
            const cutoff = new Date(today);
            cutoff.setFullYear(cutoff.getFullYear() - parseInt(filterMinAge, 10));
            filteredQuery.andWhere('p.ParticipantDOB', '<=', cutoff.toISOString().split('T')[0]);
        }
        if (filterMaxAge) {
            const cutoff = new Date(today);
            cutoff.setFullYear(cutoff.getFullYear() - parseInt(filterMaxAge, 10));
            filteredQuery.andWhere('p.ParticipantDOB', '>=', cutoff.toISOString().split('T')[0]);
        }

        if (filterCity) {
            filteredQuery.andWhere('p.ParticipantCity', 'ilike', `%${filterCity}%`);
        }
        if (filterState) {
            filteredQuery.andWhere('p.ParticipantState', 'ilike', `%${filterState}%`);
        }
        if (filterRole) {
            filteredQuery.andWhere('p.ParticipantRole', filterRole);
        }
        if (filterInterest) {
            filteredQuery.andWhere('p.ParticipantFieldOfInterest', filterInterest);
        }
        if (filterSurveyID) {
            filteredQuery.andWhere('s.SurveyID', filterSurveyID);
        }

        const totalRow = await knex.count('* as count')
            .from(filteredQuery.clone().as('survey_filtered'))
            .first();
        const totalSurveys = parseInt(totalRow?.count, 10) || 0;

        const avgRow = await filteredQuery.clone()
            .avg('s.SurveyOverallScore as avgScore')
            .first();
        const avgScore = avgRow?.avgScore !== null && avgRow?.avgScore !== undefined
            ? parseFloat(avgRow.avgScore)
            : 0;

        const totalPages = Math.max(Math.ceil(totalSurveys / limit), 1);
        const safePage = Math.min(page, totalPages);
        const offset = (safePage - 1) * limit;

        const surveyRows = await filteredQuery.clone()
            .select(
                's.SurveyID',
                's.SurveySatisfactionScore',
                's.SurveyUsefulnessScore',
                's.SurveyInstructorScore',
                's.SurveyRecommendationScore',
                's.SurveyOverallScore',
                's.SurveyNPSBucket',
                's.SurveyComments',
                's.SurveySubmissionDate',
                'r.RegistrationID',
                'p.ParticipantEmail',
                'p.ParticipantFirstName',
                'p.ParticipantLastName',
                'p.ParticipantCity',
                'p.ParticipantState',
                'p.ParticipantFieldOfInterest',
                'p.ParticipantDOB',
                'et.EventName',
                'eo.EventDateTimeStart'
            )
            .orderBy('s.SurveySubmissionDate', 'desc')
            .orderBy('s.SurveyID', 'desc')
            .limit(limit)
            .offset(offset);

        const surveys = surveyRows.map((survey) => ({
            ...survey,
            SurveyOverallScoreDisplay: survey.SurveyOverallScore !== null && survey.SurveyOverallScore !== undefined
                ? parseFloat(survey.SurveyOverallScore).toFixed(2)
                : '0.00',
            SurveySubmissionDisplay: formatDateForDisplay(survey.SurveySubmissionDate),
            EventDateDisplay: survey.EventDateTimeStart
                ? new Date(survey.EventDateTimeStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : 'Date TBD',
            ParticipantAge: calculateAge(survey.ParticipantDOB)
        }));

        const registrationQuery = knex('Registration as r')
            .join('Participants as p', 'r.ParticipantID', 'p.ParticipantID')
            .join('Event_Occurrence as eo', 'r.OccurrenceID', 'eo.OccurrenceID')
            .join('Event_Templates as et', 'eo.EventID', 'et.EventID')
            .leftJoin('Surveys as s', 'r.RegistrationID', 's.RegistrationID');

        if (!req.session.isAdmin) {
            registrationQuery.where('p.ParticipantID', req.session.user.ParticipantID);
        }

        if (searchTerm) {
            const searchPattern = `%${searchTerm}%`;
            registrationQuery.andWhere(function () {
                this.where('p.ParticipantFirstName', 'ilike', searchPattern)
                    .orWhere('p.ParticipantLastName', 'ilike', searchPattern)
                    .orWhere('p.ParticipantEmail', 'ilike', searchPattern)
                    .orWhere('et.EventName', 'ilike', searchPattern)
                    .orWhereRaw("(\"p\".\"ParticipantFirstName\" || ' ' || \"p\".\"ParticipantLastName\") ILIKE ?", [searchPattern]);
            });
        }

        if (filterStartDate) {
            registrationQuery.andWhere('eo.EventDateTimeStart', '>=', filterStartDate);
        }
        if (filterEndDate) {
            registrationQuery.andWhere('eo.EventDateTimeStart', '<=', filterEndDate);
        }
        if (filterMinAge || filterMaxAge) {
            registrationQuery.whereNotNull('p.ParticipantDOB');
        }
        if (filterMinAge) {
            const cutoff = new Date(today);
            cutoff.setFullYear(cutoff.getFullYear() - parseInt(filterMinAge, 10));
            registrationQuery.andWhere('p.ParticipantDOB', '<=', cutoff.toISOString().split('T')[0]);
        }
        if (filterMaxAge) {
            const cutoff = new Date(today);
            cutoff.setFullYear(cutoff.getFullYear() - parseInt(filterMaxAge, 10));
            registrationQuery.andWhere('p.ParticipantDOB', '>=', cutoff.toISOString().split('T')[0]);
        }
        if (filterCity) {
            registrationQuery.andWhere('p.ParticipantCity', 'ilike', `%${filterCity}%`);
        }
        if (filterState) {
            registrationQuery.andWhere('p.ParticipantState', 'ilike', `%${filterState}%`);
        }
        if (filterRole) {
            registrationQuery.andWhere('p.ParticipantRole', filterRole);
        }
        if (filterInterest) {
            registrationQuery.andWhere('p.ParticipantFieldOfInterest', filterInterest);
        }
        if (filterSurveyID) {
            registrationQuery.andWhere('s.SurveyID', filterSurveyID);
        }
        if (filterEventStartDate) {
            registrationQuery.andWhere('eo.EventDateTimeStart', '>=', filterEventStartDate);
        }
        if (filterEventEndDate) {
            registrationQuery.andWhere('eo.EventDateTimeStart', '<=', filterEventEndDate);
        }
        if (filterEventTitle) {
            registrationQuery.andWhere('et.EventName', filterEventTitle);
        }

        const registrationCountRow = await registrationQuery
            .count('* as count')
            .first();
        const totalRegistrations = parseInt(registrationCountRow?.count, 10) || 0;
        const completionRate = totalRegistrations > 0
            ? (totalSurveys / totalRegistrations) * 100
            : 0;

        let registrationOptions = [];
        let eventTitles = [];
        if (req.session.isAdmin) {
            registrationOptions = await knex('Registration as r')
                .leftJoin('Surveys as s', 'r.RegistrationID', 's.RegistrationID')
                .join('Participants as p', 'r.ParticipantID', 'p.ParticipantID')
                .join('Event_Occurrence as eo', 'r.OccurrenceID', 'eo.OccurrenceID')
                .join('Event_Templates as et', 'eo.EventID', 'et.EventID')
                .select(
                    'r.RegistrationID',
                    'p.ParticipantFirstName',
                    'p.ParticipantLastName',
                    'p.ParticipantEmail',
                    'et.EventName',
                    'eo.EventDateTimeStart'
                )
                .whereNull('s.RegistrationID')
                .where('r.RegistrationAttendedFlag', true)
                .orderBy('eo.EventDateTimeStart', 'desc');

            eventTitles = await knex('Event_Templates')
                .select('EventName')
                .orderBy('EventName', 'asc')
                .limit(100)
                .pluck('EventName');
        }

        res.render('surveys', {
            pageTitle: 'Surveys',
            surveys,
            registrationOptions,
            eventTitles,
            searchTerm,
            filters: {
                filterStartDate,
                filterEndDate,
                filterMinAge,
                filterMaxAge,
                filterCity,
                filterState,
                filterRole,
                filterInterest,
                filterEventStartDate,
                filterEventEndDate,
                filterEventTitle,
                filterSurveyID: filterSurveyID || ''
            },
            currentPage: safePage,
            totalPages,
            totalSurveys,
            hasNextPage: safePage < totalPages,
            pageSize: limit,
            metrics: {
                total: totalSurveys,
                avgScore: avgScore || 0,
                completionRate
            },
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (err) {
        console.error('Error loading surveys:', err);
        res.status(500).send('Error loading surveys');
    }
});

// GET /api/occurrence/:id/survey-info: Get event info for survey modal
app.get('/api/occurrence/:id/survey-info', async (req, res) => {
    try {
        const occurrenceId = parseInt(req.params.id, 10);
        if (!occurrenceId) {
            return res.status(400).json({ success: false, error: 'Occurrence ID is required' });
        }

        const occurrence = await knex('Event_Occurrence as eo')
            .join('Event_Templates as et', 'eo.EventID', 'et.EventID')
            .select(
                'et.EventName',
                'eo.EventDateTimeStart'
            )
            .where('eo.OccurrenceID', occurrenceId)
            .first();

        if (!occurrence) {
            return res.status(404).json({ success: false, error: 'Occurrence not found' });
        }

        return res.json({
            success: true,
            eventName: occurrence.EventName,
            eventStart: occurrence.EventDateTimeStart
        });
    } catch (err) {
        console.error('Error fetching occurrence info:', err);
        return res.status(500).json({ success: false, error: 'Error fetching occurrence information' });
    }
});

// POST /surveys/create: Create survey from profile page
app.post('/surveys/create', async (req, res) => {
    try {
        if (!req.session.user || !req.session.user.ParticipantID) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const { registrationId, satisfaction, usefulness, instructor, recommendation, comments } = req.body || {};

        if (!registrationId || satisfaction === undefined || usefulness === undefined || 
            instructor === undefined || recommendation === undefined) {
            return res.status(400).json({ success: false, error: 'All required fields must be provided' });
        }

        // Verify registration belongs to current user
        const registration = await knex('Registration')
            .where('RegistrationID', parseInt(registrationId, 10))
            .where('ParticipantID', req.session.user.ParticipantID)
            .first();

        if (!registration) {
            return res.status(403).json({ success: false, error: 'Registration not found or access denied' });
        }

        // Check if survey already exists
        const existingSurvey = await knex('Surveys')
            .where('RegistrationID', registration.RegistrationID)
            .first();

        if (existingSurvey) {
            return res.status(400).json({ success: false, error: 'Survey already exists for this registration' });
        }

        const sat = clampSurveyScore(satisfaction);
        const useful = clampSurveyScore(usefulness);
        const instructorScore = clampSurveyScore(instructor);
        const recommend = clampSurveyScore(recommendation);

        if ([sat, useful, instructorScore, recommend].some((score) => score === null)) {
            return res.status(400).json({ success: false, error: 'All survey scores must be between 0 and 5' });
        }

        const overall = computeSurveyAverage([sat, useful, instructorScore, recommend]);
        const npsBucket = determineNpsBucket(recommend) || 'Passive';

        const [surveyId] = await knex('Surveys').insert({
            RegistrationID: registration.RegistrationID,
            SurveySatisfactionScore: sat,
            SurveyUsefulnessScore: useful,
            SurveyInstructorScore: instructorScore,
            SurveyRecommendationScore: recommend,
            SurveyOverallScore: overall,
            SurveyNPSBucket: npsBucket,
            SurveyComments: comments || null,
            SurveySubmissionDate: knex.fn.now()
        }).returning('SurveyID');

        return res.json({
            success: true,
            message: 'Survey created successfully',
            surveyId: surveyId.SurveyID || surveyId
        });
    } catch (err) {
        console.error('Error creating survey:', err);
        return res.status(500).json({ success: false, error: 'Error creating survey' });
    }
});

app.post('/surveys/add', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.status(418).render('landing', {
            layout: 'public',
            pageTitle: 'Welcome',
            error: 'You do not have admin access'
        });
    }

    try {
        const {
            RegistrationID,
            SurveySatisfactionScore,
            SurveyUsefulnessScore,
            SurveyInstructorScore,
            SurveyRecommendationScore,
            SurveyComments,
            SurveySubmissionDate
        } = req.body;

        if (!RegistrationID) {
            return res.redirect('/surveys?error=' + encodeURIComponent('Registration is required.'));
        }

        const sat = clampSurveyScore(SurveySatisfactionScore);
        const useful = clampSurveyScore(SurveyUsefulnessScore);
        const instructor = clampSurveyScore(SurveyInstructorScore);
        const recommend = clampSurveyScore(SurveyRecommendationScore);

        if ([sat, useful, instructor, recommend].some((score) => score === null)) {
            return res.redirect('/surveys?error=' + encodeURIComponent('All survey scores must be between 0 and 5.'));
        }

        const registration = await knex('Registration')
            .where('RegistrationID', RegistrationID)
            .first();

        if (!registration) {
            return res.redirect('/surveys?error=' + encodeURIComponent('Registration not found.'));
        }

        const existingSurvey = await knex('Surveys')
            .where('RegistrationID', RegistrationID)
            .first();

        if (existingSurvey) {
            return res.redirect('/surveys?error=' + encodeURIComponent('A survey already exists for the selected registration.'));
        }

        const overall = computeSurveyAverage([sat, useful, instructor, recommend]);
        const npsBucket = determineNpsBucket(recommend) || 'Passive';

        await knex('Surveys').insert({
            RegistrationID,
            SurveySatisfactionScore: sat,
            SurveyUsefulnessScore: useful,
            SurveyInstructorScore: instructor,
            SurveyRecommendationScore: recommend,
            SurveyOverallScore: overall,
            SurveyNPSBucket: npsBucket,
            SurveyComments: SurveyComments || null,
            SurveySubmissionDate: SurveySubmissionDate || knex.fn.now()
        });

        return res.redirect('/surveys?success=' + encodeURIComponent('Survey added successfully.'));
    } catch (err) {
        console.error('Error adding survey:', err);
        return res.redirect('/surveys?error=' + encodeURIComponent('Error adding survey. Please try again.'));
    }
});

app.post('/surveys/edit', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.status(418).render('landing', {
            layout: 'public',
            pageTitle: 'Welcome',
            error: 'You do not have admin access'
        });
    }

    try {
        const {
            SurveyID,
            SurveySatisfactionScore,
            SurveyUsefulnessScore,
            SurveyInstructorScore,
            SurveyRecommendationScore,
            SurveyComments,
            SurveySubmissionDate
        } = req.body;

        if (!SurveyID) {
            return res.redirect('/surveys?error=' + encodeURIComponent('Survey ID is required.'));
        }

        const sat = clampSurveyScore(SurveySatisfactionScore);
        const useful = clampSurveyScore(SurveyUsefulnessScore);
        const instructor = clampSurveyScore(SurveyInstructorScore);
        const recommend = clampSurveyScore(SurveyRecommendationScore);

        if ([sat, useful, instructor, recommend].some((score) => score === null)) {
            return res.redirect('/surveys?error=' + encodeURIComponent('All survey scores must be between 0 and 5.'));
        }

        const survey = await knex('Surveys')
            .where('SurveyID', SurveyID)
            .first();

        if (!survey) {
            return res.redirect('/surveys?error=' + encodeURIComponent('Survey not found.'));
        }

        const overall = computeSurveyAverage([sat, useful, instructor, recommend]);
        const npsBucket = determineNpsBucket(recommend) || 'Passive';

        const updatePayload = {
            SurveySatisfactionScore: sat,
            SurveyUsefulnessScore: useful,
            SurveyInstructorScore: instructor,
            SurveyRecommendationScore: recommend,
            SurveyOverallScore: overall,
            SurveyNPSBucket: npsBucket,
            SurveyComments: SurveyComments || null
        };

        if (SurveySubmissionDate) {
            updatePayload.SurveySubmissionDate = SurveySubmissionDate;
        }

        await knex('Surveys')
            .where('SurveyID', SurveyID)
            .update(updatePayload);

        return res.redirect('/surveys?success=' + encodeURIComponent('Survey updated successfully.'));
    } catch (err) {
        console.error('Error updating survey:', err);
        return res.redirect('/surveys?error=' + encodeURIComponent('Error updating survey. Please try again.'));
    }
});

app.post('/surveys/delete', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.status(418).render('landing', {
            layout: 'public',
            pageTitle: 'Welcome',
            error: 'You do not have admin access'
        });
    }

    try {
        const { SurveyID } = req.body;

        if (!SurveyID) {
            return res.redirect('/surveys?error=' + encodeURIComponent('Survey ID is required.'));
        }

        await knex('Surveys')
            .where('SurveyID', SurveyID)
            .del();

        return res.redirect('/surveys?success=' + encodeURIComponent('Survey deleted successfully.'));
    } catch (err) {
        console.error('Error deleting survey:', err);
        return res.redirect('/surveys?error=' + encodeURIComponent('Error deleting survey. Please try again.'));
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
            const now = new Date();
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
                .andWhere('MilestoneDate', '<=', now)
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
            const memberSinceDisplay = formatMonthYear(participant.AccountCreatedDate);
            const userEventsRows = await knex('Registration as r')
                .leftJoin('Event_Occurrence as o', 'r.OccurrenceID', 'o.OccurrenceID')
                .leftJoin('Event_Templates as e', 'o.EventID', 'e.EventID')
                .leftJoin('Surveys as s', 'r.RegistrationID', 's.RegistrationID')
                .select(
                    'r.RegistrationID',
                    'r.RegistrationStatus',
                    'r.RegistrationAttendedFlag',
                    'r.RegistrationCheckInTime',
                    'r.RegistrationCreatedAt',
                    'o.OccurrenceID',
                    'o.EventDateTimeStart',
                    'o.EventDateTimeEnd',
                    'o.EventRegistrationDeadline',
                    'o.EventLocation',
                    'o.EventCapacity',
                    'e.EventID',
                    'e.EventName',
                    'e.EventType',
                    'e.EventRecurrencePattern',
                    's.SurveyID'
                )
                .where('r.ParticipantID', participant.ParticipantID)
                .orderBy('o.EventDateTimeStart', 'asc');

            const profileNow = new Date();
            const userEvents = userEventsRows.map(row => {
                const start = row.EventDateTimeStart ? new Date(row.EventDateTimeStart) : null;
                const end = row.EventDateTimeEnd ? new Date(row.EventDateTimeEnd) : null;
                const deadline = row.EventRegistrationDeadline ? new Date(row.EventRegistrationDeadline) : null;
                // Event is past only if end time has passed (or if no end time, if start has passed)
                const isPast = end ? end < profileNow : (start ? start < profileNow : false);
                return {
                    registrationId: row.RegistrationID,
                    status: row.RegistrationStatus || 'Registered',
                    attended: !!row.RegistrationAttendedFlag,
                    checkInTime: row.RegistrationCheckInTime,
                    occurrenceId: row.OccurrenceID,
                    start,
                    end,
                    deadline,
                    location: row.EventLocation,
                    capacity: row.EventCapacity,
                    eventId: row.EventID,
                    eventName: row.EventName,
                    eventType: row.EventType,
                    recurrence: row.EventRecurrencePattern,
                    surveyId: row.SurveyID,
                    isPast
                };
            });

            // Mark past unattended registrations as no show
            const noShowIds = userEvents
                .filter(ev => ev.isPast && !ev.attended && (!ev.status || ev.status.toLowerCase() !== 'cancelled'))
                .map(ev => ev.registrationId);
            if (noShowIds.length) {
                await knex('Registration')
                    .whereIn('RegistrationID', noShowIds)
                    .update({ RegistrationStatus: 'No Show', RegistrationAttendedFlag: false });
                userEvents.forEach(ev => {
                    if (noShowIds.includes(ev.registrationId)) {
                        ev.status = 'No Show';
                    }
                });
            }

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
                profileDOBInput,
                memberSinceDisplay,
                userEvents
            });
        } catch (err) {
            console.error('Error fetching profile:', err);
            return res.render('/', { 
                layout: 'public', 
                pageTitle: 'Home',
                participant: null,
                error: 'Error loading your profile. Please try again.',
                profileDOBDisplay: null,
                profileDOBInput: null,
                memberSinceDisplay: null
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
                        'ParticipantSchoolOrEmployer', 'ParticipantFieldOfInterest', 'ParticipantRole')
                .where('ParticipantRole', 'p');

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
            const countQuery = knex('Participants').where('ParticipantRole', 'p');
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

            // Progress data for admin modal
            const participantIds = participantsWithAge.map(p => p.ParticipantID);
            const participantProgress = {};
            participantIds.forEach((id) => {
                participantProgress[id] = {
                    events: [],
                    milestones: [],
                    donations: [],
                    summary: {
                        eventsAttended: 0,
                        surveysCompleted: 0,
                        surveyCompletionRate: 0,
                        milestonesTotal: 0,
                        totalDonations: 0,
                        donationsCount: 0
                    }
                };
            });

            if (participantIds.length > 0) {
                // Event attendance + survey completion
                const eventRows = await knex('Registration as r')
                    .join('Event_Occurrence as o', 'r.OccurrenceID', 'o.OccurrenceID')
                    .join('Event_Templates as et', 'o.EventID', 'et.EventID')
                    .leftJoin('Surveys as s', 'r.RegistrationID', 's.RegistrationID')
                    .whereIn('r.ParticipantID', participantIds)
                    .select(
                        'r.ParticipantID',
                        'r.RegistrationAttendedFlag',
                        'o.EventDateTimeStart',
                        'et.EventName',
                        's.SurveyID'
                    );

                eventRows.forEach((row) => {
                    const progress = participantProgress[row.ParticipantID];
                    if (!progress) return;
                    const attended = !!row.RegistrationAttendedFlag;
                    const surveyCompleted = !!row.SurveyID;
                    progress.events.push({
                        eventName: row.EventName,
                        eventDate: formatDateForDisplay(row.EventDateTimeStart),
                        attended,
                        surveyCompleted
                    });
                    if (attended) {
                        progress.summary.eventsAttended += 1;
                    }
                    if (surveyCompleted) {
                        progress.summary.surveysCompleted += 1;
                    }
                });

                Object.values(participantProgress).forEach((progress) => {
                    const totalEvents = progress.events.length;
                    if (totalEvents > 0) {
                        progress.summary.surveyCompletionRate = Math.round(
                            (progress.summary.surveysCompleted / totalEvents) * 100
                        );
                    }
                });

                // Milestones
                const milestoneRows = await knex('Participant_Milestone')
                    .whereIn('ParticipantID', participantIds)
                    .select('ParticipantID', 'MilestoneID', 'MilestoneTitle', 'MilestoneCategory', 'MilestoneDate');

                milestoneRows.forEach((row) => {
                    const progress = participantProgress[row.ParticipantID];
                    if (!progress) return;
                    progress.milestones.push({
                        title: row.MilestoneTitle,
                        category: row.MilestoneCategory,
                        date: formatDateForDisplay(row.MilestoneDate)
                    });
                    progress.summary.milestonesTotal += 1;
                });

                // Donations
                const donationRows = await knex('Participant_Donation')
                    .whereIn('ParticipantID', participantIds)
                    .select('ParticipantID', 'DonationDate', 'DonationAmount');

                donationRows.forEach((row) => {
                    const progress = participantProgress[row.ParticipantID];
                    if (!progress) return;
                    const amount = row.DonationAmount ? Number(row.DonationAmount) : 0;
                    progress.donations.push({
                        date: formatDateForDisplay(row.DonationDate),
                        amount
                    });
                    progress.summary.totalDonations += amount;
                    progress.summary.donationsCount += 1;
                });
            }
            
            res.render('participants', { 
                layout: 'public', 
                pageTitle: 'Participants',
                participants: participantsWithAge,
                participantProgress,
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
                participantProgress: {},
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

//will have to be uncommeted out at somepoint
// route for interactive tables 
const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);

app.get('/dashboard', (req, res) => {
    res.render('dashboard', { layout: 'public', pageTitle: 'Dashboard' });
});

app.get('/info', (req, res) => {
    res.render('info', { layout: 'public', pageTitle: 'Info' });
});

// 6. Start Server
app.listen(port, () => {
    console.log(`INTEX server listening at port:${port}`);
});
