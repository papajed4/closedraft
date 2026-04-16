// lib/polar.js
const { Polar } = require('@polar-sh/sdk');

const polarApi = new Polar({
    accessToken: process.env.POLAR_API_KEY,
    server: 'sandbox',  // Force sandbox for testing
});

module.exports = { polarApi };