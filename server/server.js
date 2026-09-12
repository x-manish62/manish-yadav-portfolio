require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const app = express();

const PORT = process.env.PORT || 3000;

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DATA = path.join(DATA_DIR, 'submissions.json');

// Make sure data folder exists
fs.mkdirSync(DATA_DIR, { recursive: true });


// ===============================
// MIDDLEWARE
// ===============================

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(
    express.static(
        path.join(ROOT, 'public')
    )
);


// ===============================
// LOCAL JSON STORAGE
// ===============================

function safeRead() {
    try {
        if (!fs.existsSync(DATA)) {
            return [];
        }

        return JSON.parse(
            fs.readFileSync(DATA, 'utf8') || '[]'
        );
    } catch (error) {
        console.error(
            'Error reading submissions:',
            error
        );

        return [];
    }
}


function safeWrite(items) {
    try {
        fs.mkdirSync(DATA_DIR, {
            recursive: true
        });

        fs.writeFileSync(
            DATA,
            JSON.stringify(items, null, 2)
        );
    } catch (error) {
        console.error(
            'Error writing submissions:',
            error
        );

        throw error;
    }
}


// ===============================
// MYSQL DATABASE
// ===============================

let pool = null;

async function db() {

    if (pool) {
        return pool;
    }

    if (!process.env.DB_HOST) {
        return null;
    }

    pool = mysql.createPool({
        host: process.env.DB_HOST,

        port: Number(
            process.env.DB_PORT || 3306
        ),

        user: process.env.DB_USER,

        password: process.env.DB_PASSWORD,

        database:
            process.env.DB_NAME ||
            'manish_portfolio',

        connectionLimit: 5
    });

    await pool.query(`
        CREATE TABLE IF NOT EXISTS submissions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            type VARCHAR(30),
            created_at DATETIME,
            payload JSON
        )
    `);

    return pool;
}


// ===============================
// SAVE SUBMISSION
// ===============================

async function saveSubmission(
    type,
    data
) {

    const record = {
        id: Date.now().toString(),

        type,

        createdAt:
            new Date().toISOString(),

        data
    };


    // Save in JSON
    const items = safeRead();

    items.unshift(record);

    safeWrite(items);


    // Save in MySQL if configured
    const p = await db();

    if (p) {

        await p.query(
            `
            INSERT INTO submissions
            (
                type,
                created_at,
                payload
            )
            VALUES (?, ?, ?)
            `,
            [
                type,
                new Date(),
                JSON.stringify(data)
            ]
        );
    }


    return record;
}


// ===============================
// BREVO EMAIL
// ===============================

async function notify(
    type,
    data
) {

    // Check Brevo configuration
    if (
        !process.env.BREVO_API_KEY ||
        !process.env.BREVO_SENDER_EMAIL ||
        !process.env.NOTIFY_EMAIL
    ) {

        console.log(
            'Brevo environment variables are missing.'
        );

        return false;
    }


    // Remove honeypot field
    const lines = Object.entries(data)

        .filter(
            ([key]) =>
                key !== 'website'
        )

        .map(
            ([key, value]) =>
                `${key}: ${value}`
        )

        .join('\n');


    const subject =
        `Portfolio ${type}: ${
            data.name ||
            'New submission'
        }`;


    const textContent =
        `New ${type} submission
from Manish Yadav Portfolio.

--------------------------------

${lines}

--------------------------------

This message was sent from
your portfolio website.`;



    try {

        const response =
            await fetch(
                'https://api.brevo.com/v3/smtp/email',
                {
                    method: 'POST',

                    headers: {
                        'accept':
                            'application/json',

                        'api-key':
                            process.env.BREVO_API_KEY,

                        'content-type':
                            'application/json'
                    },

                    body: JSON.stringify({

                        sender: {
                            name:
                                'Manish Yadav Portfolio',

                            email:
                                process.env
                                    .BREVO_SENDER_EMAIL
                        },

                        to: [
                            {
                                email:
                                    process.env
                                        .NOTIFY_EMAIL,

                                name:
                                    'Manish Yadav'
                            }
                        ],

                        subject,

                        textContent
                    })
                }
            );


        const result =
            await response.json();


        if (!response.ok) {

            console.error(
                'Brevo API Error:',
                result
            );

            return false;
        }


        console.log(
            'Brevo email sent successfully:',
            result
        );

        return true;

    } catch (error) {

        console.error(
            'Brevo request failed:',
            error
        );

        return false;
    }
}


// ===============================
// SPAM VALIDATION
// ===============================

function validate(
    req,
    res,
    next
) {

    if (req.body.website) {

        return res.status(400).json({
            message:
                'Spam detected.'
        });
    }

    next();
}


// ===============================
// CONTACT FORM
// ===============================

app.post(
    '/api/contact',
    validate,
    async (req, res) => {

        try {

            const data = req.body;


            // Save submission
            await saveSubmission(
                'contact',
                data
            );


            // Send email
            const emailed =
                await notify(
                    'contact',
                    data
                );


            if (emailed) {

                return res.json({
                    message:
                        'Message sent successfully. Email notification delivered.'
                });

            }


            return res.json({
                message:
                    'Message saved, but email notification could not be delivered.'
            });


        } catch (error) {

            console.error(
                'Contact error:',
                error
            );


            return res.status(500).json({
                message:
                    'Could not save the message.'
            });
        }
    }
);


// ===============================
// HIRE ME FORM
// ===============================

app.post(
    '/api/hire',
    validate,
    async (req, res) => {

        try {

            const data = req.body;


            // Save hiring request
            await saveSubmission(
                'hire',
                data
            );


            // Send email
            const emailed =
                await notify(
                    'hire',
                    data
                );


            if (emailed) {

                return res.json({
                    message:
                        'Hiring request sent successfully. Email notification delivered.'
                });

            }


            return res.json({
                message:
                    'Hiring request saved, but email notification could not be delivered.'
            });


        } catch (error) {

            console.error(
                'Hire error:',
                error
            );


            return res.status(500).json({
                message:
                    'Could not save the hiring request.'
            });
        }
    }
);


// ===============================
// ADMIN SUBMISSIONS
// ===============================

app.get(
    '/api/admin/submissions',
    async (req, res) => {

        if (
            !process.env.ADMIN_KEY ||
            req.query.key !==
                process.env.ADMIN_KEY
        ) {

            return res.status(401).json({
                message:
                    'Invalid admin key.'
            });
        }


        try {

            const p = await db();


            // MySQL available
            if (p) {

                const [rows] =
                    await p.query(
                        `
                        SELECT *
                        FROM submissions
                        ORDER BY created_at DESC
                        LIMIT 200
                        `
                    );


                return res.json({
                    items:
                        rows.map(
                            (row) => ({

                                id:
                                    row.id,

                                type:
                                    row.type,

                                createdAt:
                                    row.created_at,

                                data:
                                    typeof row.payload ===
                                    'string'

                                        ? JSON.parse(
                                              row.payload
                                          )

                                        : row.payload
                            })
                        )
                });
            }


            // JSON storage
            return res.json({
                items:
                    safeRead().slice(
                        0,
                        200
                    )
            });


        } catch (error) {

            console.error(
                'Admin error:',
                error
            );


            return res.status(500).json({
                message:
                    'Could not load submissions.'
            });
        }
    }
);


// ===============================
// HEALTH CHECK
// ===============================

app.get(
    '/health',
    (req, res) => {

        res.json({
            ok: true,

            service:
                'Manish Yadav Portfolio',

            email:
                process.env
                    .BREVO_API_KEY
                    ? 'configured'
                    : 'not configured'
        });
    }
);


// ===============================
// START SERVER
// ===============================

app.listen(
    PORT,
    () => {

        console.log(
            `Portfolio running on port ${PORT}`
        );
    }
);