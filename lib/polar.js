// lib/polar.js
const { Polar } = require('@polar-sh/sdk');

const polarApi = new Polar({
    accessToken: process.env.POLAR_API_KEY,
    server: 'production',  // ← CHANGE THIS FROM 'sandbox' TO 'production'
});

module.exports = { polarApi };