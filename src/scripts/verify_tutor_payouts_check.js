
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Connect to MongoDB
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected');
    } catch (err) {
        console.error('MongoDB Connection Error:', err);
        process.exit(1);
    }
};

// Import Models (using require to ensure registration)
require('../models/User');
require('../models/FinalClass');
require('../models/AttendanceSheet');
require('../models/Payment');
// require('../models/ClassLead'); // Start with basics

const User = mongoose.model('User');
const FinalClass = mongoose.model('FinalClass');
const AttendanceSheet = mongoose.model('AttendanceSheet');
const Payment = mongoose.model('Payment');

// Import Service - we need to use require for the service too, but after models are registered
// Note: services usually export using ES6 export default or named exports.
// If compiled to CommonJS, we can require them.
// Since we are running .js in src, we might be running against TS source with ts-node?
// Earlier we used .js and ran with `node`.
// If `attendanceSheetService` is TS, we can't require it directly in Node without ts-node.
// Let's try to use the build output if available, or just use ts-node to run a .ts script?
// The user has `ts-node` available (used in previous tasks).
// I will write a .ts script and try to run it with `npx ts-node`.

// Wait, I had issues with ts-node before.
// I'll stick to .js but I can't import TS files directly.
// Exception: if I use `ts-node` it handles .ts imports.

// Let's try .ts script again, but be careful with imports.
// Using `verify_tutor_payouts.ts`

// ... switching to TS content ...
