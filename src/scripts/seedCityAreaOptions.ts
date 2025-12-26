import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../config/database';
import Option from '../models/Option';

dotenv.config();

const CITY_TYPE = 'CITY';

const cities: { label: string; value: string; sortOrder: number }[] = [
  { label: 'Bhopal', value: 'BHOPAL', sortOrder: 1 },
];

// Areas per city, keyed by the CITY option value
const cityAreas: Record<string, { label: string; value: string; sortOrder: number }[]> = {
  BHOPAL: [
    { label: 'Arera Colony', value: 'ARERA_COLONY', sortOrder: 1 },
    { label: 'MP Nagar', value: 'MP_NAGAR', sortOrder: 2 },
    { label: 'Kolar Road', value: 'KOLAR_ROAD', sortOrder: 3 },
    { label: 'Hoshangabad Road', value: 'HOSHANGABAD_ROAD', sortOrder: 4 },
    { label: 'Berasia Road', value: 'BERASIA_ROAD', sortOrder: 5 },
    { label: 'Ayodhya Bypass', value: 'AYODHYA_BYPASS', sortOrder: 6 },
    { label: 'Bairagarh', value: 'BAIRAGARH', sortOrder: 7 },
    { label: 'Katara Hills', value: 'KATARA_HILLS', sortOrder: 8 },
    { label: 'Shahpura', value: 'SHAHPURA', sortOrder: 9 },
    { label: 'Jahangirabad', value: 'JAHANGIRABAD', sortOrder: 10 },
    { label: 'Govindpura', value: 'GOVINDPURA', sortOrder: 11 },
    { label: 'Ashoka Garden', value: 'ASHOKA_GARDEN', sortOrder: 12 },
    { label: 'Bawadiya Kalan', value: 'BAWADIYA_KALAN', sortOrder: 13 },
    { label: 'Raisen Road', value: 'RAISEN_ROAD', sortOrder: 14 },
  ],
};

const run = async () => {
  try {
    await connectDB();

    // Clear existing CITY and AREA_* options so we start fresh
    await Option.deleteMany({ type: CITY_TYPE });
    await Option.deleteMany({ type: { $regex: /^AREA_/ } });

    // Seed cities
    for (const c of cities) {
      const existing = await Option.findOne({ type: CITY_TYPE, value: c.value });
      if (existing) {
        console.log(`City option already exists: ${c.value}`);
      } else {
        await Option.create({
          type: CITY_TYPE,
          label: c.label,
          value: c.value,
          sortOrder: c.sortOrder,
          isActive: true,
        });
        console.log(`Created city option: ${c.value}`);
      }

      // Seed areas for this city under type AREA_<CITYVALUE>
      const areaType = `AREA_${c.value}`;
      const areas = cityAreas[c.value] || [];
      for (const a of areas) {
        const existingArea = await Option.findOne({ type: areaType, value: a.value });
        if (existingArea) {
          console.log(`Area option already exists: ${areaType}:${a.value}`);
          continue;
        }
        await Option.create({
          type: areaType,
          label: a.label,
          value: a.value,
          sortOrder: a.sortOrder,
          isActive: true,
        });
        console.log(`Created area option: ${areaType}:${a.value}`);
      }
    }

    console.log('City and area options seeding completed.');
  } catch (err) {
    console.error('Error seeding city/area options', err);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
};

run();
