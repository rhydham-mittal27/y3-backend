import 'dotenv/config';
import mongoose from 'mongoose';
import AttendanceSheet from '../models/AttendanceSheet';
import Payment from '../models/Payment';
import { createCyclePayments } from '../services/paymentService';

const uri = process.env.MONGODB_URI || process.env.DATABASE_URL || '';

if (!uri) {
  console.error('[seedCyclePayments] Missing MONGODB_URI/DATABASE_URL in environment');
  process.exit(1);
}

async function connect() {
  await mongoose.connect(uri);
  console.log('[seedCyclePayments] Connected to MongoDB');
}

async function main() {
  await connect();

  const sheets = await AttendanceSheet.find({}).select('_id periodLabel').lean();
  console.log(`[seedCyclePayments] Found ${sheets.length} attendance sheets`);

  let createdCount = 0;
  let skippedCount = 0;

  for (const sheet of sheets) {
    const sheetId = String(sheet._id);
    
    // Check if any payment already exists for this sheet
    const existingPayment = await Payment.findOne({ attendanceSheet: sheet._id }).lean();
    
    if (existingPayment) {
      console.log(`[seedCyclePayments] Skipping sheet ${sheetId} (${sheet.periodLabel}) - payments already exist`);
      skippedCount++;
      continue;
    }

    try {
      // Use a dummy system ID for createdBy
      await createCyclePayments(sheetId, '000000000000000000000000');
      console.log(`[seedCyclePayments] Generated cycle payments for sheet ${sheetId} (${sheet.periodLabel})`);
      createdCount++;
    } catch (e: any) {
      console.error(`[seedCyclePayments] Failed to create payments for sheet ${sheetId}:`, e?.message || e);
    }
  }

  console.log(`[seedCyclePayments] Done.`);
  console.log(`- Created payments for: ${createdCount} sheets`);
  console.log(`- Skipped: ${skippedCount} sheets (already had payments)`);
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (e) => {
    console.error('[seedCyclePayments] Failed', e);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  });
