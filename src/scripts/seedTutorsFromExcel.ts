import "dotenv/config";
import mongoose from "mongoose";
import * as XLSX from "xlsx";
import path from "path";
import User from "../models/User";
import Tutor from "../models/Tutor";
import { USER_ROLES, VERIFICATION_STATUS, TUTOR_TIER } from "../config/constants";
import generateTeacherId from "../utils/generateTeacherId";

/**
 * SEEDING SCRIPT: Tutors from Excel
 * 
 * Instructions:
 * 1. Install xlsx: npm install xlsx
 * 2. Update the COLUMN_MAPPING below to match your Excel headers.
 * 3. Run: npm run seed:tutors-excel (Wait, add the command to package.json)
 *    OR: npx ts-node src/scripts/seedTutorsFromExcel.ts
 */

const EXCEL_FILE_PATH = path.join(__dirname, "../../data/tutordatarealtime.xlsx");

// ADJUST THIS MAPPING TO MATCH YOUR EXCEL COLUMNS EXACTLY AS IN THE IMAGE
const COLUMN_MAPPING = {
  name: "NAME",
  email: "EMAIL",
  phone: "NUMBER",
  subjects: "SUBJECT", 
  preferredMode: "PREFERED MODE",
  location: "LOCATION",
  experience: "EXPERIENCED",
  extracurriculars: "INTRESTED IN EXTRACURRISURRALS",
  gender: "GENDER",
  notes: "NOTES",
  leadSource: "LEAD SOURCE",
  createdAt: "CREATED DATE",
};

async function seedTutors() {
  const uri = process.env.MONGODB_URI || process.env.DATABASE_URL;
  if (!uri) {
    console.error("MONGODB_URI or DATABASE_URL not found in .env");
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log("Connected to MongoDB");

    const workbook = XLSX.readFile(EXCEL_FILE_PATH);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data: any[] = XLSX.utils.sheet_to_json(sheet);

    console.log(`Found ${data.length} rows in Excel.`);

    let successCount = 0;
    let errorCount = 0;

    for (const row of data) {
      try {
        const email = String(row[COLUMN_MAPPING.email] || "").toLowerCase().trim();
        const name = String(row[COLUMN_MAPPING.name] || "").trim();

        if (!email) {
          console.warn(`Skipping row for "${name}" - no email.`);
          continue;
        }

        // Check if user already exists
        let user = await User.findOne({ email });
        if (user) {
          console.log(`User ${email} already exists. Skipping.`);
          continue;
        }

        // 1. Create User
        user = await User.create({
          name: name || "Unknown Tutor",
          email: email,
          password: "Password@123", // Default password
          phone: String(row[COLUMN_MAPPING.phone] || ""),
          role: USER_ROLES.TUTOR,
          isActive: true,
        });

        // 2. Create Tutor Profile
        const subjects = typeof row[COLUMN_MAPPING.subjects] === "string" 
          ? row[COLUMN_MAPPING.subjects].split(",").map((s: string) => s.trim()).filter(Boolean)
          : row[COLUMN_MAPPING.subjects] ? [String(row[COLUMN_MAPPING.subjects])] : ["General"];

        const extracurriculars = typeof row[COLUMN_MAPPING.extracurriculars] === "string"
          ? row[COLUMN_MAPPING.extracurriculars].split(",").map((s: string) => s.trim()).filter(Boolean)
          : row[COLUMN_MAPPING.extracurriculars] ? [String(row[COLUMN_MAPPING.extracurriculars])] : [];

        // Parse years of experience from string like "20 years msc maths"
        const expStr = String(row[COLUMN_MAPPING.experience] || "");
        const yearsMatch = expStr.match(/(\d+)/);
        const yearsOfExperience = yearsMatch ? parseInt(yearsMatch[1], 10) : 0;

        const gender = String(row[COLUMN_MAPPING.gender] || "Male");
        const location = String(row[COLUMN_MAPPING.location] || "Bhopal");

        // Generate TM... style ID
        const teacherId = generateTeacherId(gender, location);

        await Tutor.create({
          user: user._id,
          teacherId: teacherId,
          experienceHours: yearsOfExperience * 100, 
          yearsOfExperience: yearsOfExperience,
          subjects: subjects.length > 0 ? subjects : ["General"],
          qualifications: expStr ? [expStr] : [],
          extracurricularActivities: extracurriculars,
          bio: String(row[COLUMN_MAPPING.notes] || ""),
          verificationStatus: VERIFICATION_STATUS.PENDING,
          isAvailable: true,
          preferredMode: (row[COLUMN_MAPPING.preferredMode] || "ONLINE").toUpperCase(),
          preferredLocations: [location],
          tier: TUTOR_TIER.BRONZE,
        });

        successCount++;
        if (successCount % 10 === 0) console.log(`Processed ${successCount} tutors...`);
      } catch (err: any) {
        console.error(`Error processing row:`, err.message);
        errorCount++;
      }
    }

    console.log("\nSeeding Summary:");
    console.log(`Successfully created: ${successCount}`);
    console.log(`Errors: ${errorCount}`);

  } catch (err: any) {
    console.error("Critical error during seeding:", err.message);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

seedTutors();
