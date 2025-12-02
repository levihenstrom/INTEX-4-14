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
app.get('/login', (req, res) => {
    res.render('login', { layout: 'public' });
});

app.post('/login', async (req, res) => {
    const { ParticipantEmail, ParticipantPassword} = req.body;
  
    try {
      // Get full user row so session has everything
      const user = await knex('participants')
        .where({ParticipantEmail, ParticipantPassword})
        .first();
  
      if (!user) {
        return res.render('login', { 
          layout: 'public', 
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
        error: 'Something went wrong. Please try again.' 
    });
    }
});
    
  // GET /register: Show registration form
app.get('/register', (req, res) => {
    res.render('register', { 
    layout: 'public',
    error: null
    });
});
    
 // POST /register: Handle registration attempt 
app.post('/register', async (req, res) => {
    const { 
    ParticipantEmail, 
    ParticipantPassword, 
    ParticipantFirstName, 
    ParticipantLastName, 
    ParticipantDOB, 
    ParticipantPhone, 
    fav_resort 
    } = req.body;

    try {
    const favResortId = parseInt(fav_resort, 10);

    // 1. Validate required fields
    if (
        !username || 
        !email || 
        !password || 
        !first_name || 
        !last_name || 
        !birthday || 
        Number.isNaN(favResortId)
    ) {
        return res.render('register', { 
        layout: 'public', 
        error: 'All fields are required.'
        // resorts come from res.locals.resorts automatically
        });
    }

    // 2. Check if username or email already exists
    const existingUser = await knex('participants')
        .where('username', username)
        .orWhere('email', email)
        .first();

    if (existingUser) {
        return res.render('register', { 
        layout: 'public', 
        error: 'That username or email is already taken.'
        });
    }

    // 3. Insert the user
    await knex('users').insert({
        first_name,
        last_name,
        username,
        email,
        password,          // plaintext is fine for class
        birthday,
        fav_resort: favResortId,
        date_created: knex.fn.now()
    });

    // 4. Redirect to login
    return res.redirect('/login');

    } catch (err) {
    console.error('Registration error:', err);

    return res.render('register', {
        layout: 'public',
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