import 'dotenv/config';
import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import User from '../models/User';
import ClassLead from '../models/ClassLead';
import Option from '../models/Option';
import {
  USER_ROLES,
  BOARD_TYPE,
  TEACHING_MODE,
  CLASS_LEAD_STATUS,
} from '../config/constants';

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL || 'mongodb://localhost:27017/yourshikshak';
const CSV_PATH = path.join(__dirname, '../../../pyscripts/class-leads.csv');

async function connect() {
  await mongoose.connect(MONGODB_URI);
  console.log('[Seed] Connected to MongoDB');
}

async function getOrCreateManager() {
  let manager = await User.findOne({ role: USER_ROLES.MANAGER });
  if (!manager) {
    manager = await User.create({
      name: 'System Manager',
      email: 'manager@yourshikshak.in',
      password: 'Password@123',
      role: USER_ROLES.MANAGER,
      phone: '9999999999',
      isActive: true,
    });
    console.log('[Seed] Created new system manager');
  }
  return manager;
}

function parseDate(dateStr: string) {
  if (!dateStr || dateStr.trim() === '') return null;
  
  const str = dateStr.trim();
  
  // Try various date formats
  // Format: "August 20, 2025 3:04pm" or "August 20, 2025 3:04am"
  const longDateRegex = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}):(\d{2})(am|pm)$/i;
  const longMatch = str.match(longDateRegex);
  if (longMatch) {
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                        'july', 'august', 'september', 'october', 'november', 'december'];
    const monthIndex = monthNames.indexOf(longMatch[1].toLowerCase());
    if (monthIndex !== -1) {
      let hour = parseInt(longMatch[4]);
      const minute = parseInt(longMatch[5]);
      const ampm = longMatch[6].toLowerCase();
      
      if (ampm === 'pm' && hour !== 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;
      
      const d = new Date(parseInt(longMatch[3]), monthIndex, parseInt(longMatch[2]), hour, minute);
      if (!isNaN(d.getTime())) return d;
    }
  }
  
  // Format: "8/20/2025 7:00pm" or "8/20/2025 7:00am"
  const shortDateRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(am|pm)$/i;
  const shortMatch = str.match(shortDateRegex);
  if (shortMatch) {
    let hour = parseInt(shortMatch[4]);
    const minute = parseInt(shortMatch[5]);
    const ampm = shortMatch[6].toLowerCase();
    
    if (ampm === 'pm' && hour !== 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    
    const d = new Date(parseInt(shortMatch[3]), parseInt(shortMatch[1]) - 1, parseInt(shortMatch[2]), hour, minute);
    if (!isNaN(d.getTime())) return d;
  }
  
  // Format: "28/01/2026, 2:23 pm" or "28/01/2026 2:23pm" (DD/MM/YYYY format with comma and optional space)
  const euroDateRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})\s*(am|pm)$/i;
  const euroMatch = str.match(euroDateRegex);
  if (euroMatch) {
    let hour = parseInt(euroMatch[4]);
    const minute = parseInt(euroMatch[5]);
    const ampm = euroMatch[6].toLowerCase();
    
    if (ampm === 'pm' && hour !== 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    
    // DD/MM/YYYY format - day is first, month is second
    const d = new Date(parseInt(euroMatch[3]), parseInt(euroMatch[2]) - 1, parseInt(euroMatch[1]), hour, minute);
    if (!isNaN(d.getTime())) return d;
  }
  
  return null;
}

function cleanPhone(phone: string) {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length > 10 ? cleaned.slice(-10) : cleaned;
}

async function main() {
  await connect();
  const manager = await getOrCreateManager();

  console.log('[Seed] Deleting all existing class leads...');
  const deleteResult = await ClassLead.deleteMany({});
  console.log(`[Seed] Deleted ${deleteResult.deletedCount} leads.`);

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`[Seed] CSV file not found at ${CSV_PATH}`);
    process.exit(1);
  }

  const workbook = XLSX.readFile(CSV_PATH);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  console.log(`[Seed] Read ${data.length} rows from CSV.`);

  let leadCounter = 1;
  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ row: number; studentName: string; error: string; phone?: string }> = [];

  // Find a default subject option to satisfy ClassLead validation
  const someSubject = await Option.findOne({ type: 'SUBJECT' });
  const defaultSubjectId = someSubject ? someSubject._id : null;

  if (!defaultSubjectId) {
    console.warn('[Seed] Warning: No SUBJECT options found in DB. Leads might fail validation if subject is required.');
  }

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    let studentName = String(row[0] || '').trim();
    let phone = cleanPhone(String(row[1] || '').trim());
    let thirdCol = String(row[2] || '').trim();
    
    // Find date in any column - look for patterns like "July 17, 2025 10:47pm" or "8/20/2025 7:00pm" or "28/01/2026, 2:23 pm"
    let dateStr = '';
    for (const col of row) {
      const str = String(col || '').trim();
      // Match patterns like "July 17, 2025 10:47pm" or "8/20/2025 7:00pm" or "28/01/2026, 2:23 pm"
      if (/^[A-Za-z]+\s+\d{1,2},?\s+\d{4}\s+\d{1,2}:\d{2}(am|pm)$/i.test(str) ||
          /^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}(am|pm)$/i.test(str) ||
          /^\d{1,2}\/\d{1,2}\/\d{4},?\s+\d{1,2}:\d{2}\s*(am|pm)$/i.test(str)) {
        dateStr = str;
        break;
      }
    }

    let grade = '';
    let board = BOARD_TYPE.CBSE; 
    let parentName = '';

    // For rows with only 4 columns (old format)
    if (row.length <= 5) {
      grade = thirdCol;
      // Look for date in remaining columns
      for (let j = 3; j < row.length; j++) {
        const str = String(row[j] || '').trim();
        if (/^[A-Za-z]+\s+\d{1,2},?\s+\d{4}\s+\d{1,2}:\d{2}(am|pm)$/i.test(str) ||
            /^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}(am|pm)$/i.test(str) ||
            /^\d{1,2}\/\d{1,2}\/\d{4},?\s+\d{1,2}:\d{2}\s*(am|pm)$/i.test(str)) {
          dateStr = str;
          break;
        }
      }
    } else {
      // For rows with more columns (new format)
      parentName = thirdCol === 'NA' ? '' : thirdCol;
      // Grade is typically at index 3 or 4
      grade = String(row[3] || '').trim();
      if (!grade || grade === 'NA') {
        grade = String(row[4] || '').trim();
      }
    }

    // Extract board from grade
    if (grade.toUpperCase().includes('CBS')) {
      board = BOARD_TYPE.CBSE;
      grade = grade.replace(/CBS/i, '').trim();
    } else if (grade.toUpperCase().includes('ICS')) {
      board = BOARD_TYPE.ICSE;
      grade = grade.replace(/ICS/i, '').trim();
    }

    const leadId = `CL-${Date.now()}-${leadCounter++}`;
    const createdAt = parseDate(dateStr);

    // Skip if no valid date from CSV
    if (!createdAt) {
      errorCount++;
      const errorMsg = 'No valid date found in CSV';
      errors.push({
        row: i + 1,
        studentName: studentName || `student - ${i + 1}`,
        error: errorMsg,
        phone: phone || undefined,
      });
      console.warn(`[Seed] Skipped row ${i + 1} (${studentName}): ${errorMsg}`);
      continue;
    }

    const leadData = {
      leadId,
      studentType: 'SINGLE',
      studentName: studentName === 'NA' || !studentName ? `student - ${i + 1}` : studentName,
      studentGender: 'M', 
      parentName: parentName || studentName,
      parentPhone: phone,
      grade: grade || 'N/A',
      board,
      mode: TEACHING_MODE.OFFLINE,
      timing: 'As per schedule',
      status: CLASS_LEAD_STATUS.NEW,
      createdBy: manager._id,
      subject: defaultSubjectId ? [defaultSubjectId] : [],
      createdAt,
      updatedAt: createdAt,
    };

    try {
      await ClassLead.create(leadData);
      successCount++;
    } catch (err: any) {
      errorCount++;
      const errorMsg = err.errors 
        ? Object.keys(err.errors).map(key => `${key}: ${err.errors[key].message}`).join(', ')
        : err.message;
      
      errors.push({
        row: i + 1,
        studentName: leadData.studentName,
        error: errorMsg,
        phone: phone || undefined,
      });
      
      console.warn(`[Seed] Skipped row ${i + 1} (${studentName}): ${errorMsg}`);
    }
  }

  console.log(`\n[Seed] Seeding completed.`);
  console.log(`[Seed] Successfully created: ${successCount} leads`);
  console.log(`[Seed] Skipped/Failed: ${errorCount} leads`);
  
  if (errors.length > 0) {
    console.log('\n[Seed] Error Summary:');
    errors.forEach(e => {
      console.log(`  Row ${e.row}: ${e.studentName}${e.phone ? ` (${e.phone})` : ''} - ${e.error}`);
    });
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('[Seed] Final Error:', err);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  process.exit(1);
});
